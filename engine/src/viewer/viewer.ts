import type { AppMessage, ErrorMessage, OpenMessage, PageMessage, ViewerSettings } from '../bridge/bridge-messages';
import { detect } from '../detect/detect';
import { DocumentError } from '../document-error';
import type { FormatAdapter, Mode, RenderContext } from '../formats/format-adapter';
import { adapterFor } from '../formats/registry';
import { logger, roundMs, timed } from '../logger';
import { sanitizeReading } from '../sanitize/sanitize';
import { base64ToBytes, firstVisibleBlock, pickMode, viewportContent } from './viewer-helpers';

/** What is open: the bytes and adapter, which modes are rendered, and which can be shown. */
interface Session {
  controller: AbortController;
  adapter?: FormatAdapter;
  bytes?: Uint8Array;
  /** Set once the first mode is shown; `setMode` is ignored before that. */
  mode?: Mode;
  /** The modes the document can show (one after a fallback). */
  available: Mode[];
  rendered: Set<Mode>;
  pageWidthPx?: number;
}

/** Where the reader was, to restore after a mode switch. */
type Position = { block: number } | { fraction: number };

const FALLBACK_NOTES: Record<Mode, string> = {
  layout: "Layout isn't available for this document.",
  reading: "Reading isn't available for this document.",
};
// A failure of these says something about the file itself, so the other mode would fail the same way.
const NO_FALLBACK_CODES = ['encrypted', 'unsupported_version'];

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function toErrorMessage(error: unknown): ErrorMessage {
  if (error instanceof DocumentError) return { type: 'error', code: error.code, message: error.message };
  logger.debug('render failed', error);
  return { type: 'error', code: 'corrupt', message: 'The document could not be read.' };
}

function otherMode(mode: Mode): Mode {
  return mode === 'layout' ? 'reading' : 'layout';
}

export function createViewer(send: (message: PageMessage) => void) {
  const root = document.documentElement;
  const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  const noteBar = element('div', 'dr-note-bar');
  noteBar.setAttribute('role', 'status');
  const views: Record<Mode, HTMLElement> = {
    layout: element('div', 'dr-layout-view'),
    reading: element('div', 'dr-reading-view'),
  };
  noteBar.hidden = true;
  document.body.append(noteBar, views.layout, views.reading);
  hideViews();

  let session: Session | undefined;

  function element(tag: string, className: string): HTMLElement {
    const el = document.createElement(tag);
    el.className = className;
    return el;
  }

  function hideViews(): void {
    views.layout.hidden = true;
    views.reading.hidden = true;
  }

  function applySettings(settings: ViewerSettings): void {
    const style = root.style;
    style.setProperty('--ink', settings.colors.ink);
    style.setProperty('--paper', settings.colors.paper);
    style.setProperty('--canvas', settings.colors.paper);
    style.setProperty('--text-size', `${settings.textSizePx}px`);
    style.setProperty('--font', settings.fontStyle === 'serif' ? 'serif' : 'sans-serif');
    style.setProperty('color-scheme', settings.theme);
  }

  function capturePosition(mode: Mode): Position {
    const blocks = Array.from(views[mode].querySelectorAll<HTMLElement>('[data-block]')).map((el) => ({
      index: Number(el.dataset['block']),
      top: el.getBoundingClientRect().top,
    }));
    const block = firstVisibleBlock(blocks);
    if (block !== undefined) return { block };
    return { fraction: window.scrollY / Math.max(1, document.documentElement.scrollHeight) };
  }

  function restorePosition(mode: Mode, position: Position | undefined): void {
    if (position === undefined) {
      window.scrollTo(0, 0);
    } else if ('block' in position) {
      const target = views[mode].querySelector(`[data-block="${position.block}"]`);
      window.scrollTo(0, target ? target.getBoundingClientRect().top + window.scrollY : 0);
    } else {
      window.scrollTo(0, position.fraction * document.documentElement.scrollHeight);
    }
  }

  /** Renders a mode into its container the first time it is needed. */
  async function ensureRendered(s: Session, mode: Mode): Promise<void> {
    if (s.rendered.has(mode)) return;
    const { adapter, bytes } = s;
    if (!adapter || !bytes) return;
    const ctx: RenderContext = { signal: s.controller.signal };
    try {
      if (mode === 'layout') {
        const renderLayout = adapter.renderLayout?.bind(adapter);
        if (!renderLayout) throw new DocumentError('unsupported_format', 'Layout is not available.');
        const { pageWidthPx } = await timed('render', () => renderLayout(bytes, views.layout, ctx));
        s.pageWidthPx = pageWidthPx;
      } else {
        const html = await timed('render', () => adapter.renderReading(bytes, ctx));
        ctx.signal.throwIfAborted();
        views.reading.innerHTML = await timed('sanitize', () => sanitizeReading(html));
      }
      ctx.signal.throwIfAborted();
      s.rendered.add(mode);
    } catch (error) {
      views[mode].replaceChildren();
      throw error;
    }
  }

  function show(s: Session, mode: Mode, position: Position | undefined): void {
    s.mode = mode;
    views.layout.hidden = mode !== 'layout';
    views.reading.hidden = mode !== 'reading';
    viewport?.setAttribute('content', viewportContent(mode, s.pageWidthPx));
    restorePosition(mode, position);
  }

  function rendered(s: Session, mode: Mode, adapter: FormatAdapter, startedAt: number): void {
    send({
      type: 'rendered',
      format: adapter.format,
      mode,
      durationMs: roundMs(performance.now() - startedAt),
      otherModeAvailable: s.available.length > 1,
    });
  }

  async function open(message: OpenMessage): Promise<void> {
    session?.controller.abort();
    const s: Session = { controller: new AbortController(), available: [], rendered: new Set() };
    session = s;
    const startedAt = performance.now();
    applySettings(message.settings);
    hideViews();
    views.layout.replaceChildren();
    views.reading.replaceChildren();
    noteBar.hidden = true;

    try {
      const bytes = base64ToBytes(message.base64);
      // Lets the app's spinner paint, and lets a newer `open` cancel this one before the work starts.
      await yieldToBrowser();
      s.controller.signal.throwIfAborted();
      const format = await detect(bytes);
      s.controller.signal.throwIfAborted();
      const adapter = adapterFor(format);
      if (!adapter) throw new DocumentError('unsupported_format', 'This format cannot be shown yet.');
      s.adapter = adapter;
      s.bytes = bytes;
      s.available = [...adapter.modes];

      const wanted = pickMode(message.mode, adapter.modes);
      let shown = wanted;
      try {
        await ensureRendered(s, wanted);
      } catch (error) {
        const fallback = otherMode(wanted);
        const canFallBack =
          !s.controller.signal.aborted &&
          adapter.modes.includes(fallback) &&
          !(error instanceof DocumentError && NO_FALLBACK_CODES.includes(error.code));
        if (!canFallBack) throw error;
        await ensureRendered(s, fallback).catch(() => {
          throw error;
        });
        shown = fallback;
        s.available = [fallback];
        noteBar.textContent = FALLBACK_NOTES[wanted];
        noteBar.hidden = false;
      }
      show(s, shown, undefined);
      rendered(s, shown, adapter, startedAt);
    } catch (error) {
      if (s.controller.signal.aborted) return;
      hideViews();
      send(toErrorMessage(error));
    }
  }

  async function setMode(mode: Mode): Promise<void> {
    const s = session;
    if (!s?.adapter || s.mode === undefined || mode === s.mode || !s.available.includes(mode)) return;
    const startedAt = performance.now();
    const position = capturePosition(s.mode);
    try {
      await ensureRendered(s, mode);
      show(s, mode, position);
      rendered(s, mode, s.adapter, startedAt);
    } catch (error) {
      if (s.controller.signal.aborted) return;
      // Stay where we are, and stop offering the mode that failed.
      logger.debug('mode switch failed', error);
      s.available = [s.mode];
      rendered(s, s.mode, s.adapter, startedAt);
    }
  }

  function openExternal(href: string | null): void {
    if (href) send({ type: 'openLink', href });
  }

  function scrollToFragment(href: string): void {
    let id = href.slice(1);
    try {
      id = decodeURIComponent(id);
    } catch {
      // Keep the raw fragment.
    }
    document.getElementById(id)?.scrollIntoView();
  }

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const external = target?.closest('.dr-link');
    if (external) {
      event.preventDefault();
      openExternal(external.getAttribute('data-external-href'));
      return;
    }
    const anchor = target?.closest('a');
    if (!anchor) return;
    event.preventDefault();
    const href = anchor.getAttribute('href');
    if (href?.startsWith('#')) scrollToFragment(href);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const external = event.target instanceof Element ? event.target.closest('.dr-link') : null;
    if (!external) return;
    event.preventDefault();
    openExternal(external.getAttribute('data-external-href'));
  });

  return {
    handle(message: AppMessage): void {
      switch (message.type) {
        case 'open':
          void open(message);
          break;
        case 'setMode':
          void setMode(message.mode);
          break;
        case 'setSettings':
          applySettings(message.settings);
          break;
      }
    },
  };
}

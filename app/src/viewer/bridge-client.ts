import { RENDER_TIMEOUT_MS, type ThemeMode, type ViewMode } from '../config/constants';
import { logger } from '../logger';
import {
  parsePageMessage,
  type ErrorMessage,
  type RenderedMessage,
  type ViewerSettings,
} from './generated/bridge-messages';

/** What the app tells the page about looks; `colors` come from the current palette. */
export interface ViewerSettingsInput {
  theme: ThemeMode;
  readingTextSize: number;
  readingFontStyle: ViewerSettings['fontStyle'];
  colors: { ink: string; paper: string };
}

export function toViewerSettings(input: ViewerSettingsInput): ViewerSettings {
  return {
    theme: input.theme,
    textSizePx: input.readingTextSize,
    fontStyle: input.readingFontStyle,
    colors: { ink: input.colors.ink, paper: input.colors.paper },
  };
}

export interface BridgeHandlers {
  onRendered: (message: RenderedMessage) => void;
  onError: (message: ErrorMessage) => void;
  onOpenLink: (href: string) => void;
  /** No `rendered` or `error` came within the render timeout after `open` was sent. */
  onTimeout: () => void;
  /** Reading the document failed (the error is the read's own). */
  onReadFailed: (error: unknown) => void;
  /** The `open` message went out: the page is working. */
  onOpenSent?: () => void;
}

export interface OpenRequest {
  name: string;
  mode: ViewMode;
  /** Reads the document as base64; called once the page is ready. */
  readBase64: () => Promise<string>;
}

/**
 * The app's side of the bridge, with no React Native in it: the web view's `postMessage` is passed in.
 * Nothing is sent before the page says `ready`; settings sent earlier are kept and go out with `open`.
 */
export class BridgeClient {
  private ready = false;
  private settings: ViewerSettings;
  private request: OpenRequest | null = null;
  private opened = false;
  private closed = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly postMessage: (json: string) => void,
    private readonly handlers: BridgeHandlers,
    settings: ViewerSettingsInput,
  ) {
    this.settings = toViewerSettings(settings);
  }

  /** Opens the document as soon as the page is ready (now, if it already is). */
  open(request: OpenRequest): void {
    this.request = request;
    if (this.ready) void this.sendOpen();
  }

  setMode(mode: ViewMode): void {
    if (this.closed || !this.opened) return;
    this.send({ type: 'setMode', mode });
  }

  /** Sends the settings again; does nothing when they haven't changed. */
  setSettings(input: ViewerSettingsInput): void {
    const next = toViewerSettings(input);
    if (JSON.stringify(next) === JSON.stringify(this.settings)) return;
    this.settings = next;
    if (this.ready && !this.closed) this.send({ type: 'setSettings', settings: next });
  }

  /** Stops everything: the timer is cleared and later messages are dropped. */
  close(): void {
    this.closed = true;
    this.stopTimer();
  }

  /** Handles one raw message string from the page. */
  receive(raw: string): void {
    if (this.closed) return;
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      logger.debug('ignored a page message that is not JSON');
      return;
    }
    const message = parsePageMessage(value);
    if (!message) {
      logger.debug('ignored an unknown page message');
      return;
    }
    switch (message.type) {
      case 'ready':
        this.ready = true;
        if (this.request) void this.sendOpen();
        break;
      case 'rendered':
        this.stopTimer();
        this.handlers.onRendered(message);
        break;
      case 'error':
        this.stopTimer();
        this.handlers.onError(message);
        break;
      case 'openLink':
        this.handlers.onOpenLink(message.href);
        break;
    }
  }

  private async sendOpen(): Promise<void> {
    const request = this.request;
    if (!request || this.opened) return;
    this.opened = true;
    try {
      const base64 = await request.readBase64();
      if (this.closed) return;
      this.send({ type: 'open', name: request.name, base64, mode: request.mode, settings: this.settings });
      this.timer = setTimeout(() => {
        this.timer = null;
        if (!this.closed) this.handlers.onTimeout();
      }, RENDER_TIMEOUT_MS);
      this.handlers.onOpenSent?.();
    } catch (error) {
      this.opened = false;
      if (!this.closed) this.handlers.onReadFailed(error);
    }
  }

  private stopTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private send(message: object): void {
    this.postMessage(JSON.stringify(message));
  }
}

import { renderAsync } from 'docx-preview';
import mammoth from 'mammoth/mammoth.browser.min.js';
import { DocumentError } from '../../document-error';
import { logger } from '../../logger';
import { sanitizeLayout } from '../../sanitize/sanitize';
import type { FormatAdapter } from '../format-adapter';

const CSS_DPI = 96;
const A4_WIDTH_PX = 794;
const PX_PER_UNIT: Record<string, number> = {
  px: 1,
  pt: CSS_DPI / 72,
  in: CSS_DPI,
  cm: CSS_DPI / 2.54,
  mm: CSS_DPI / 25.4,
};
const CSS_LENGTH = /^\s*(\d+(?:\.\d+)?|\.\d+)\s*(px|pt|in|cm|mm)\s*$/i;

const LAYOUT_OPTIONS = {
  inWrapper: true,
  breakPages: true,
  ignoreWidth: false,
  ignoreHeight: false,
  ignoreFonts: false,
  renderHeaders: true,
  renderFooters: true,
  renderFootnotes: true,
  renderEndnotes: true,
  renderComments: false,
  renderChanges: false,
  useBase64URL: true,
  experimental: false,
  className: 'docx',
};

const READING_OPTIONS = {
  includeDefaultStyleMap: true,
  // mammoth's default map has Heading 1 to 6 but not Title.
  styleMap: ["p[style-name='Title'] => h1:fresh", "p[style-name='Subtitle'] => h2:fresh"],
  ignoreEmptyParagraphs: true,
};

/** A page width from the inline `width` docx-preview writes, in CSS pixels at 96 dpi; A4 when missing or unreadable. */
export function pageWidthFromCss(width: string | null | undefined): number {
  const match = CSS_LENGTH.exec(width ?? '');
  const unit = match?.[2];
  if (!match?.[1] || !unit) return A4_WIDTH_PX;
  const px = parseFloat(match[1]) * (PX_PER_UNIT[unit.toLowerCase()] ?? 0);
  return px > 0 && Number.isFinite(px) ? Math.round(px) : A4_WIDTH_PX;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** docx: docx-preview draws Layout, mammoth produces Reading. */
export const docxAdapter: FormatAdapter = {
  format: 'docx',
  modes: ['layout', 'reading'],
  async renderLayout(bytes, container, ctx) {
    const holder = document.createElement('div');
    try {
      await renderAsync(toArrayBuffer(bytes), holder, holder, LAYOUT_OPTIONS);
    } catch (error) {
      throw new DocumentError('corrupt', 'The document could not be read.', { cause: error });
    }
    ctx.signal.throwIfAborted();
    const pageWidthPx = pageWidthFromCss(holder.querySelector<HTMLElement>('section.docx')?.style.width);
    container.innerHTML = sanitizeLayout(holder.innerHTML);
    return { pageWidthPx };
  },
  async renderReading(bytes, ctx) {
    ctx.signal.throwIfAborted();
    try {
      const result = await mammoth.convertToHtml({ arrayBuffer: toArrayBuffer(bytes) }, READING_OPTIONS);
      logger.debug('mammoth warnings', { count: result.messages.length });
      return `<div class="dr-reading">${result.value}</div>`;
    } catch (error) {
      throw new DocumentError('corrupt', 'The document could not be read.', { cause: error });
    }
  },
};

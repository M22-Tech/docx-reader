export type Format = 'docx' | 'doc' | 'rtf' | 'odt' | 'html';

export type Mode = 'raw' | 'rendered';

/** What a render call needs besides the bytes. */
export interface RenderContext {
  /** Aborted when the open is cancelled or times out. */
  signal: AbortSignal;
}

/** One adapter per format; the viewer picks it from `detect()`. */
export interface FormatAdapter {
  format: Format;
  /** The modes this format can show. */
  modes: readonly Mode[];
  /** Draws Raw mode into `container`: documents as laid out (with `pageWidthPx`, the page width in CSS pixels), source files as text (no page width). */
  renderRaw?(bytes: Uint8Array, container: HTMLElement, ctx: RenderContext): Promise<{ pageWidthPx?: number }>;
  /** Returns reflowable HTML for Rendered mode (not yet sanitised). */
  renderRendered(bytes: Uint8Array, ctx: RenderContext): Promise<string>;
}

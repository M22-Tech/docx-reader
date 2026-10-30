export type Format = 'docx' | 'doc' | 'rtf' | 'odt' | 'html';

export type Mode = 'layout' | 'reading';

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
  /** Draws the document as laid out into `container`. */
  renderLayout?(bytes: Uint8Array, container: HTMLElement, ctx: RenderContext): Promise<void>;
  /** Returns reflowable HTML for Reading mode (not yet sanitised). */
  renderReading(bytes: Uint8Array, ctx: RenderContext): Promise<string>;
}

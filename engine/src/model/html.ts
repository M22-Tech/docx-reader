const BASE64_CHUNK = 0x8000;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
// Quotes, backslashes, semicolons and braces end or escape a declaration; the rest keep a value from carrying a function call.
const FONT_FAMILY_FORBIDDEN = /["'\\;{}()<>:]/g;
const PX_PER_MM = 96 / 25.4;

/** Escapes text for use between tags. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Escapes a value for use inside a quoted attribute. */
export function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Encodes bytes as base64 in chunks, so large images don't overflow the call stack. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK));
  }
  return btoa(binary);
}

/** Returns the colour when it is `#rrggbb`, otherwise undefined. */
export function safeColor(value: string | undefined): string | undefined {
  return value !== undefined && HEX_COLOR.test(value) ? value : undefined;
}

/** Returns a font family name without characters that could end or extend a CSS declaration, or undefined when nothing is left. */
export function safeFontFamily(value: string | undefined): string | undefined {
  const cleaned = value?.replace(FONT_FAMILY_FORBIDDEN, '').trim();
  return cleaned ? cleaned : undefined;
}

/** Returns the number rounded to 3 decimals when it is finite, otherwise undefined. */
export function safeNumber(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) ? Math.round(value * 1000) / 1000 : undefined;
}

/** Converts millimetres to CSS pixels at 96 dpi. */
export function mmToPx(mm: number): number {
  return mm * PX_PER_MM;
}

/** The box an image becomes when it can't be shown; `withStyle` adds the size as inline style (Rendered output carries no styles). */
export function placeholderHtml(widthPx: number | undefined, heightPx: number | undefined, withStyle: boolean): string {
  const width = safeNumber(widthPx);
  const height = safeNumber(heightPx);
  const attrs: string[] = [];
  if (width !== undefined) attrs.push(`width="${width}"`);
  if (height !== undefined) attrs.push(`height="${height}"`);
  if (withStyle) {
    const style = [
      width !== undefined ? `width:${width}px` : '',
      height !== undefined ? `height:${height}px` : '',
    ].filter(Boolean);
    if (style.length > 0) attrs.push(`style="${style.join(';')}"`);
  }
  return `<span class="dr-placeholder"${attrs.map((a) => ` ${a}`).join('')}>Image not shown</span>`;
}

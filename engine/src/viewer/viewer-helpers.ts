import type { Mode } from '../formats/format-adapter';

// A multiple of 4 characters, so every chunk of base64 decodes on its own.
const BASE64_CHUNK_CHARS = 65536;

/** Decodes base64 to bytes in chunks, so a large file doesn't need one huge intermediate string. */
export function base64ToBytes(base64: string): Uint8Array {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array(Math.max(0, Math.floor((base64.length * 3) / 4) - padding));
  let offset = 0;
  for (let start = 0; start < base64.length; start += BASE64_CHUNK_CHARS) {
    const binary = atob(base64.slice(start, start + BASE64_CHUNK_CHARS));
    for (let i = 0; i < binary.length; i++) bytes[offset + i] = binary.charCodeAt(i);
    offset += binary.length;
  }
  return bytes;
}

/** The requested mode when the adapter has it, otherwise the adapter's first mode. */
export function pickMode(requested: Mode, available: readonly Mode[]): Mode {
  return available.includes(requested) ? requested : (available[0] ?? requested);
}

/** The index of the first block whose top is at or below the top of the screen. */
export function firstVisibleBlock(blocks: readonly { index: number; top: number }[]): number | undefined {
  return blocks.find((block) => block.top >= 0)?.index;
}

/** The viewport meta content for a mode (Raw fits the page width to the screen). */
export function viewportContent(mode: Mode, pageWidthPx: number | undefined): string {
  if (mode === 'raw' && pageWidthPx !== undefined && Number.isFinite(pageWidthPx) && pageWidthPx > 0) {
    return `width=${Math.round(pageWidthPx)}, user-scalable=yes, maximum-scale=4`;
  }
  return 'width=device-width, initial-scale=1, user-scalable=no';
}

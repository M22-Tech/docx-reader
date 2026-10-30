/** Bullet characters that are shown as they are. */
const PLAIN_BULLETS = new Set(['•', '◦', '▪', '■', '●', '○', '-']);

/** Symbol and Wingdings bullets arrive as private-use characters (U+F000 plus the font's byte); they map to • ◦ ▪. */
const FONT_BULLETS: Record<number, string> = {
  0xb7: '•',
  0x9f: '•',
  0x6c: '•',
  0xd8: '•',
  0xfc: '•',
  0x76: '•',
  0xa7: '▪',
  0x6e: '▪',
  0x6f: '◦',
  0xa8: '◦',
  0x6d: '◦',
};

/**
 * The bullet a list marker stands for, or undefined when the marker is not a bullet (so the list is ordered). The
 * marker may carry spaces and a tab around it. Any single private-use character is a bullet; the ones known from
 * Symbol and Wingdings map to • ◦ ▪, the others to •.
 */
export function bulletFor(marker: string): string | undefined {
  const text = marker.replace(/^[\s]+|[\s]+$/g, '');
  const chars = [...text];
  if (chars.length !== 1) return undefined;
  const char = chars[0] as string;
  if (PLAIN_BULLETS.has(char)) return char;
  const code = char.codePointAt(0) as number;
  if (code >= 0xf000 && code <= 0xf0ff) return FONT_BULLETS[code - 0xf000] ?? '•';
  return undefined;
}

const MM_PER_UNIT = {
  mm: 1,
  cm: 10,
  in: 25.4,
  pt: 25.4 / 72,
  pc: 25.4 / 6,
  px: 25.4 / 96,
} as const;

type Unit = keyof typeof MM_PER_UNIT;

const LENGTH = /^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(mm|cm|in|pt|pc|px)\s*$/i;

/** A length read from an ODF or CSS attribute, held in millimetres. */
export interface Length {
  mm: number;
  pt: number;
  /** CSS pixels at 96 dpi. */
  px: number;
}

/** Parses "2.5in", "10pt" and so on; undefined for percentages, bare numbers and anything else. */
export function parseLength(text: string | null | undefined): Length | undefined {
  if (!text) return undefined;
  const match = LENGTH.exec(text);
  if (!match) return undefined;
  const mm = Number(match[1]) * MM_PER_UNIT[(match[2] as string).toLowerCase() as Unit];
  if (!Number.isFinite(mm)) return undefined;
  return { mm, pt: (mm * 72) / 25.4, px: (mm * 96) / 25.4 };
}

const MM_PER_TWIP = 25.4 / 1440;

/** Twips (1/1440 inch, the RTF and doc length unit) to millimetres. */
export function twipsToMm(twips: number): number {
  return twips * MM_PER_TWIP;
}

/** Twips to points. */
export function twipsToPt(twips: number): number {
  return twips / 20;
}

/** Twips to CSS pixels at 96 dpi. */
export function twipsToPx(twips: number): number {
  return twips / 15;
}

/** Half-points (RTF `\fs`) to points. */
export function halfPointsToPt(halfPoints: number): number {
  return halfPoints / 2;
}

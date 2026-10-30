type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

const HEADING_STYLE = /^heading\s*([1-9])$/i;

function clamp(level: number): HeadingLevel {
  return Math.min(Math.max(level, 1), 6) as HeadingLevel;
}

function levelOfStyleName(name: string): HeadingLevel | undefined {
  const trimmed = name.trim();
  const numbered = HEADING_STYLE.exec(trimmed);
  if (numbered) return clamp(Number(numbered[1]));
  const lower = trimmed.toLowerCase();
  if (lower === 'title') return 1;
  if (lower === 'subtitle') return 2;
  return undefined;
}

/**
 * The heading rule shared by the model parsers: an outline level of 1 to 9 wins (7 to 9 become 6); otherwise the nearest
 * of `styleNames` (the style and the styles it is based on, nearest first) named "Heading 1" to "Heading 9", "Title"
 * (level 1) or "Subtitle" (level 2) decides.
 */
export function headingLevelFor(input: {
  outlineLevel?: number | undefined;
  styleNames: readonly string[];
}): HeadingLevel | undefined {
  const { outlineLevel, styleNames } = input;
  if (outlineLevel !== undefined && Number.isInteger(outlineLevel) && outlineLevel >= 1 && outlineLevel <= 9) {
    return clamp(outlineLevel);
  }
  for (const name of styleNames) {
    const level = levelOfStyleName(name);
    if (level !== undefined) return level;
  }
  return undefined;
}

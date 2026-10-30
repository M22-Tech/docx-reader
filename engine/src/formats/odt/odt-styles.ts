import { parseLength } from '../shared/units';
import { attr, childElements, firstChild, NS, round } from './odt-xml';

/** Character formatting after inheritance; colours are `#rrggbb` (or `transparent` for a background). */
export interface TextProps {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  position?: 'super' | 'sub' | 'normal';
  color?: string;
  background?: string;
  fontFamily?: string;
  fontSizePt?: number;
}

/** Paragraph formatting after inheritance. */
export interface ParagraphProps {
  align?: 'left' | 'center' | 'right' | 'justify';
  marginLeftMm?: number;
  marginRightMm?: number;
  textIndentMm?: number;
  marginTopPt?: number;
  marginBottomPt?: number;
  /** A multiple of the font size. */
  lineHeight?: number;
  breakBefore?: boolean;
}

/** Everything the body walk needs to know about a paragraph style. */
export interface ResolvedParagraph {
  text: TextProps;
  para: ParagraphProps;
  outlineLevel: number | undefined;
  listStyleName: string | undefined;
  masterPageName: string | undefined;
  /** The style's name and its ancestors', nearest first, as a person sees them ("Heading 1"). */
  styleNames: string[];
}

export interface ColumnStyle {
  widthMm?: number;
  /** The weight of `style:rel-column-width` ("21845*"). */
  relative?: number;
}

export interface OdtStyles {
  paragraph(name: string | undefined): ResolvedParagraph;
  /** The properties of a character style laid over `base`. */
  applyTextStyle(base: TextProps, name: string | undefined): TextProps;
  column(name: string | undefined): ColumnStyle;
  /** `style:rel-width` of a table style, in percent. */
  tableRelWidthPercent(name: string | undefined): number | undefined;
  cellBackground(name: string | undefined): string | undefined;
}

type RawTextProps = TextProps & { fontSizePercent?: number };

const MAX_CHAIN = 64;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** `Heading_20_1` is how ODF writes "Heading 1". */
export function decodeStyleName(name: string): string {
  return name.replace(/_20_/g, ' ');
}

function overlay<T extends object>(base: T, over: Partial<T>): T {
  const result = { ...base } as Record<string, unknown>;
  for (const [key, value] of Object.entries(over)) {
    if (value !== undefined) result[key] = value;
  }
  return result as T;
}

function applyRawText(base: TextProps, raw: RawTextProps): TextProps {
  const { fontSizePercent, ...own } = raw;
  const result = overlay(base, own);
  if (fontSizePercent !== undefined && own.fontSizePt === undefined && base.fontSizePt !== undefined) {
    result.fontSizePt = (base.fontSizePt * fontSizePercent) / 100;
  }
  return result;
}

function readFontWeight(value: string): boolean | undefined {
  if (value === 'bold') return true;
  if (value === 'normal') return false;
  if (/^\d+$/.test(value)) return Number(value) >= 600;
  return undefined;
}

function readPosition(value: string): TextProps['position'] {
  const first = value.trim().split(/\s+/)[0] ?? '';
  if (first === 'super') return 'super';
  if (first === 'sub') return 'sub';
  const percent = /^([+-]?\d+(?:\.\d+)?)%$/.exec(first);
  if (!percent) return undefined;
  const amount = Number(percent[1]);
  if (amount > 0) return 'super';
  if (amount < 0) return 'sub';
  return 'normal';
}

function readTextProps(style: Element, fonts: ReadonlyMap<string, string>): RawTextProps {
  const props = firstChild(style, NS.style, 'text-properties');
  const result: RawTextProps = {};
  if (!props) return result;

  const weight = attr(props, NS.fo, 'font-weight');
  if (weight !== undefined) {
    const bold = readFontWeight(weight);
    if (bold !== undefined) result.bold = bold;
  }
  const fontStyle = attr(props, NS.fo, 'font-style');
  if (fontStyle !== undefined) result.italic = fontStyle === 'italic' || fontStyle === 'oblique';
  const underline = attr(props, NS.style, 'text-underline-style');
  if (underline !== undefined) result.underline = underline !== 'none';
  const strike = attr(props, NS.style, 'text-line-through-style');
  if (strike !== undefined) result.strike = strike !== 'none';
  const position = attr(props, NS.style, 'text-position');
  if (position !== undefined) {
    const read = readPosition(position);
    if (read !== undefined) result.position = read;
  }
  const color = attr(props, NS.fo, 'color');
  if (color !== undefined && HEX_COLOR.test(color)) result.color = color.toLowerCase();
  const background = attr(props, NS.fo, 'background-color');
  if (background === 'transparent') result.background = 'transparent';
  else if (background !== undefined && HEX_COLOR.test(background)) result.background = background.toLowerCase();

  const fontName = attr(props, NS.style, 'font-name');
  const family =
    (fontName === undefined ? undefined : (fonts.get(fontName) ?? fontName)) ?? attr(props, NS.fo, 'font-family');
  if (family) {
    const clean = family.replace(/['"]/g, '').trim();
    if (clean) result.fontFamily = clean;
  }

  const size = attr(props, NS.fo, 'font-size');
  if (size !== undefined) {
    const length = parseLength(size);
    const percent = /^(\d+(?:\.\d+)?)%$/.exec(size.trim());
    if (length) result.fontSizePt = round(length.pt, 2);
    else if (percent) result.fontSizePercent = Number(percent[1]);
  }
  return result;
}

function readAlign(value: string): ParagraphProps['align'] {
  if (value === 'start' || value === 'left') return 'left';
  if (value === 'end' || value === 'right') return 'right';
  if (value === 'center' || value === 'justify') return value;
  return undefined;
}

function readParagraphProps(style: Element): ParagraphProps {
  const props = firstChild(style, NS.style, 'paragraph-properties');
  const result: ParagraphProps = {};
  if (!props) return result;

  const align = attr(props, NS.fo, 'text-align');
  if (align !== undefined) {
    const read = readAlign(align);
    if (read !== undefined) result.align = read;
  }
  const left = parseLength(attr(props, NS.fo, 'margin-left'));
  if (left) result.marginLeftMm = round(left.mm, 3);
  const right = parseLength(attr(props, NS.fo, 'margin-right'));
  if (right) result.marginRightMm = round(right.mm, 3);
  const indent = parseLength(attr(props, NS.fo, 'text-indent'));
  if (indent) result.textIndentMm = round(indent.mm, 3);
  const top = parseLength(attr(props, NS.fo, 'margin-top'));
  if (top) result.marginTopPt = round(top.pt, 2);
  const bottom = parseLength(attr(props, NS.fo, 'margin-bottom'));
  if (bottom) result.marginBottomPt = round(bottom.pt, 2);
  const height = attr(props, NS.fo, 'line-height');
  const percent = height === undefined ? null : /^(\d+(?:\.\d+)?)%$/.exec(height.trim());
  if (percent) result.lineHeight = Number(percent[1]) / 100;
  const breakBefore = attr(props, NS.fo, 'break-before');
  if (breakBefore !== undefined) result.breakBefore = breakBefore === 'page';
  return result;
}

/** Reads the fonts and styles of both files and resolves styles on demand. */
export function readStyles(content: Document, styles: Document | undefined): OdtStyles {
  const fonts = new Map<string, string>();
  const named = new Map<string, Element>();
  const defaults = new Map<string, Element>();

  const key = (family: string, name: string) => `${family}\u0000${name}`;

  function collect(root: Element | undefined): void {
    if (!root) return;
    for (const section of childElements(root)) {
      if (section.namespaceURI !== NS.office) continue;
      for (const element of childElements(section)) {
        if (element.namespaceURI !== NS.style) continue;
        if (section.localName === 'font-face-decls' && element.localName === 'font-face') {
          const name = attr(element, NS.style, 'name');
          const family = attr(element, NS.svg, 'font-family');
          if (name !== undefined && family !== undefined) fonts.set(name, family);
        } else if (element.localName === 'default-style') {
          const family = attr(element, NS.style, 'family');
          if (family !== undefined && section.localName === 'styles') defaults.set(family, element);
        } else if (element.localName === 'style') {
          const family = attr(element, NS.style, 'family');
          const name = attr(element, NS.style, 'name');
          if (family !== undefined && name !== undefined) named.set(key(family, name), element);
        }
      }
    }
  }

  // Later sources win: named styles, then the automatic styles of styles.xml, then those of content.xml.
  collect(styles?.documentElement);
  collect(content.documentElement);

  /** The style and its ancestors, root first. */
  function chain(family: string, name: string | undefined): Element[] {
    const result: Element[] = [];
    const seen = new Set<string>();
    let current = name;
    while (current !== undefined && current !== '' && !seen.has(current) && result.length < MAX_CHAIN) {
      seen.add(current);
      const element = named.get(key(family, current));
      if (!element) break;
      result.unshift(element);
      current = attr(element, NS.style, 'parent-style-name');
    }
    return result;
  }

  const paragraphCache = new Map<string, ResolvedParagraph>();
  const textChainCache = new Map<string, RawTextProps[]>();

  function resolveParagraph(name: string | undefined): ResolvedParagraph {
    const elements = chain('paragraph', name);
    const base = defaults.get('paragraph');
    let text: TextProps = {};
    let para: ParagraphProps = {};
    let outlineLevel: number | undefined;
    let listStyleName: string | undefined;
    let masterPageName: string | undefined;

    for (const element of base ? [base, ...elements] : elements) {
      text = applyRawText(text, readTextProps(element, fonts));
      para = overlay(para, readParagraphProps(element));
      const outline = attr(element, NS.style, 'default-outline-level');
      if (outline !== undefined) outlineLevel = /^\d+$/.test(outline) ? Number(outline) : undefined;
      const list = attr(element, NS.style, 'list-style-name');
      if (list !== undefined) listStyleName = list === '' ? undefined : list;
      const master = attr(element, NS.style, 'master-page-name');
      if (master !== undefined) masterPageName = master === '' ? undefined : master;
    }

    const styleNames = elements
      .map((element) => {
        const display = attr(element, NS.style, 'display-name');
        return display ?? decodeStyleName(attr(element, NS.style, 'name') ?? '');
      })
      .reverse();
    return { text, para, outlineLevel, listStyleName, masterPageName, styleNames };
  }

  function rawTextChain(name: string): RawTextProps[] {
    let cached = textChainCache.get(name);
    if (!cached) {
      cached = chain('text', name).map((element) => readTextProps(element, fonts));
      textChainCache.set(name, cached);
    }
    return cached;
  }

  /** A property element of a style, without inheritance. */
  function ownProps(family: string, name: string | undefined, localName: string): Element | undefined {
    const style = name === undefined ? undefined : named.get(key(family, name));
    return style ? firstChild(style, NS.style, localName) : undefined;
  }

  return {
    paragraph(name) {
      const cacheKey = name ?? '';
      let resolved = paragraphCache.get(cacheKey);
      if (!resolved) {
        resolved = resolveParagraph(name);
        paragraphCache.set(cacheKey, resolved);
      }
      return resolved;
    },
    applyTextStyle(base, name) {
      if (name === undefined) return base;
      return rawTextChain(name).reduce<TextProps>((acc, raw) => applyRawText(acc, raw), base);
    },
    column(name) {
      const props = ownProps('table-column', name, 'table-column-properties');
      const result: ColumnStyle = {};
      if (!props) return result;
      const width = parseLength(attr(props, NS.style, 'column-width'));
      if (width) result.widthMm = round(width.mm, 3);
      const relative = /^(\d+(?:\.\d+)?)\*$/.exec((attr(props, NS.style, 'rel-column-width') ?? '').trim());
      if (relative) result.relative = Number(relative[1]);
      return result;
    },
    tableRelWidthPercent(name) {
      const props = ownProps('table', name, 'table-properties');
      const match = props ? /^(\d+(?:\.\d+)?)%$/.exec((attr(props, NS.style, 'rel-width') ?? '').trim()) : null;
      return match ? Number(match[1]) : undefined;
    },
    cellBackground(name) {
      const props = ownProps('table-cell', name, 'table-cell-properties');
      const color = props ? attr(props, NS.fo, 'background-color') : undefined;
      return color !== undefined && HEX_COLOR.test(color) ? color.toLowerCase() : undefined;
    },
  };
}

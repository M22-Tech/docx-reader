/** Character formatting set directly or by a style; a missing key means "not set here". */
export interface CharProps {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  script?: 'super' | 'sub' | 'none';
  /** Font table index. */
  font?: number;
  /** Half-points. */
  size?: number;
  /** Colour table indexes. */
  color?: number;
  highlight?: number;
  shade?: number;
  hidden?: boolean;
  deleted?: boolean;
  /** Character style index (`\csN`). */
  style?: number;
}

/** Paragraph formatting; lengths in twips. */
export interface ParaProps {
  align?: 'left' | 'center' | 'right' | 'justify';
  left?: number;
  right?: number;
  /** `\lin` and `\rin`, preferred over `\li` and `\ri` when present. */
  leftIn?: number;
  rightIn?: number;
  first?: number;
  before?: number;
  after?: number;
  line?: number;
  lineMultiple?: boolean;
  /** `\outlinelevelN`, 0 to 8. */
  outline?: number;
  pageBreakBefore?: boolean;
  inTable?: boolean;
  itap?: number;
  /** `\ilvlN`. */
  level?: number;
  /** Paragraph style index (`\sN`). */
  style?: number;
}

/** Every underline style word; `\ulnone` and `\ulc` (colour) are not among them. */
const UNDERLINES = new Set([
  'ul',
  'uld',
  'uldash',
  'uldashd',
  'uldashdd',
  'uldb',
  'ulhwave',
  'ulldash',
  'ulth',
  'ulthd',
  'ulthdash',
  'ulthdashd',
  'ulthdashdd',
  'ulthldash',
  'ululdbwave',
  'ulw',
  'ulwave',
]);

/** Applies a character control word to `props`; false when the word is not one. */
export function applyCharWord(props: CharProps, name: string, param: number | undefined): boolean {
  const on = param !== 0;
  switch (name) {
    case 'b':
      props.bold = on;
      return true;
    case 'i':
      props.italic = on;
      return true;
    case 'strike':
    case 'striked':
      props.strike = on;
      return true;
    case 'super':
      props.script = on ? 'super' : 'none';
      return true;
    case 'sub':
      props.script = on ? 'sub' : 'none';
      return true;
    case 'nosupersub':
      props.script = 'none';
      return true;
    case 'ulnone':
      props.underline = false;
      return true;
    case 'v':
      props.hidden = on;
      return true;
    case 'deleted':
      props.deleted = on;
      return true;
    case 'f':
      if (param !== undefined) props.font = param;
      return true;
    case 'fs':
      if (param !== undefined) props.size = param;
      return true;
    case 'cf':
      if (param !== undefined) props.color = param;
      return true;
    case 'highlight':
      if (param !== undefined) props.highlight = param;
      return true;
    case 'chcbpat':
      if (param !== undefined) props.shade = param;
      return true;
    case 'cs':
      if (param !== undefined) props.style = param;
      return true;
    default:
      if (UNDERLINES.has(name)) {
        props.underline = on;
        return true;
      }
      return false;
  }
}

/** Applies a paragraph control word to `props`; false when the word is not one. */
export function applyParaWord(props: ParaProps, name: string, param: number | undefined): boolean {
  switch (name) {
    case 'ql':
      props.align = 'left';
      return true;
    case 'qc':
      props.align = 'center';
      return true;
    case 'qr':
      props.align = 'right';
      return true;
    case 'qj':
      props.align = 'justify';
      return true;
    case 'slmult':
      props.lineMultiple = param !== 0;
      return true;
    case 'pagebb':
      props.pageBreakBefore = param !== 0;
      return true;
    case 'intbl':
      props.inTable = true;
      return true;
    default:
  }
  if (param === undefined) return false;
  switch (name) {
    case 'li':
      props.left = param;
      return true;
    case 'ri':
      props.right = param;
      return true;
    case 'lin':
      props.leftIn = param;
      return true;
    case 'rin':
      props.rightIn = param;
      return true;
    case 'fi':
      props.first = param;
      return true;
    case 'sb':
      props.before = param;
      return true;
    case 'sa':
      props.after = param;
      return true;
    case 'sl':
      props.line = param;
      return true;
    case 'outlinelevel':
      props.outline = param;
      return true;
    case 'itap':
      props.itap = param;
      return true;
    case 'ilvl':
      props.level = param;
      return true;
    case 's':
      props.style = param;
      return true;
    default:
      return false;
  }
}

import type { Marks, Paragraph } from '../../model/document-model';
import { halfPointsToPt, twipsToMm, twipsToPt } from '../shared/units';
import { headingLevelFor } from '../shared/heading-rule';
import { i16, readSprms, Sprm, u16, u8 } from './doc-sprm';
import type { StyleSheet } from './doc-styles';

/** Word's 16-colour palette by `ico`; index 0 is auto. */
const PALETTE: readonly (string | undefined)[] = [
  undefined,
  '#000000',
  '#0000ff',
  '#00ffff',
  '#00ff00',
  '#ff00ff',
  '#ff0000',
  '#ffff00',
  '#ffffff',
  '#000080',
  '#008080',
  '#008000',
  '#800080',
  '#800000',
  '#808000',
  '#808080',
  '#c0c0c0',
];

/** The size when no style sets one: 10 pt, in half-points. */
const DEFAULT_SIZE_HPS = 20;
/** The size the renderers use for text without a size mark. */
const BASE_FONT_PT = 11;

const JUSTIFY_FIRST = 3;
const JUSTIFY_LAST = 5;

const round = (value: number) => Math.round(value * 1000) / 1000;
const nonZero = (value: number | undefined) => (value === undefined || value === 0 ? undefined : value);

/** Character properties set by sprms; a missing key means "not set here". */
export interface CharProps {
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  /** `sprmCFVanish`. */
  hidden?: boolean;
  /** `sprmCFRMarkDel`. */
  deleted?: boolean;
  underline?: boolean;
  script?: 'super' | 'sub' | 'none';
  /** Half-points. */
  size?: number;
  /** `sprmCIco`, an index into the palette. */
  ico?: number;
  /** `sprmCCv`: a colour, or the word "auto". */
  cv?: string;
  /** `sprmCHighlight`, an index into the palette. */
  highlight?: number;
  /** Font index for Latin text (`sprmCRgFtc0`) and its fallback (`sprmCRgFtc2`). */
  font?: number;
  fontOther?: number;
  /** Character style (`sprmCIstd`). */
  style?: number;
}

/** Paragraph properties set by sprms; lengths in twips. The `80` variants are the older sprms, which the newer ones override. */
export interface ParaProps {
  jc80?: number;
  jc?: number;
  left80?: number;
  left?: number;
  right80?: number;
  right?: number;
  first80?: number;
  first?: number;
  before?: number;
  after?: number;
  line?: number;
  lineMultiple?: boolean;
  /** `sprmPOutLvl`: 0 to 8, or 9 for body text. */
  outline?: number;
  pageBreakBefore?: boolean;
}

/** A toggle sprm operand: 0 off, 1 on, 0x80 the same as the style, 0x81 the opposite of the style. */
function toggle(current: boolean | undefined, operand: number): boolean {
  if (operand === 0) return false;
  if (operand === 1) return true;
  if (operand === 0x81) return !current;
  return current ?? false;
}

/** `sprmCCv`'s `COLORREF`: red, green, blue, then 0xFF when the colour is auto. */
function colorRef(operand: Uint8Array): string {
  if (operand.length < 4 || operand[3] === 0xff) return 'auto';
  const hex = (value: number | undefined) => (value ?? 0).toString(16).padStart(2, '0');
  return `#${hex(operand[0])}${hex(operand[1])}${hex(operand[2])}`;
}

/** The character style a grpprl names, if any. */
export function characterStyleOf(grpprl: Uint8Array): number | undefined {
  let style: number | undefined;
  for (const { sprm, operand } of readSprms(grpprl)) if (sprm === Sprm.CIstd) style = u16(operand);
  return style;
}

/** Applies the character sprms of a grpprl to `props`, in order. */
export function applyCharSprms(props: CharProps, grpprl: Uint8Array): void {
  for (const { sprm, operand } of readSprms(grpprl)) {
    switch (sprm) {
      case Sprm.CFBold:
        props.bold = toggle(props.bold, u8(operand));
        break;
      case Sprm.CFItalic:
        props.italic = toggle(props.italic, u8(operand));
        break;
      case Sprm.CFStrike:
        props.strike = toggle(props.strike, u8(operand));
        break;
      case Sprm.CFVanish:
        props.hidden = toggle(props.hidden, u8(operand));
        break;
      case Sprm.CFRMarkDel:
        props.deleted = toggle(props.deleted, u8(operand));
        break;
      case Sprm.CKul:
        props.underline = u8(operand) !== 0;
        break;
      case Sprm.CIss:
        props.script = u8(operand) === 1 ? 'super' : u8(operand) === 2 ? 'sub' : 'none';
        break;
      case Sprm.CHps:
        props.size = u16(operand);
        break;
      case Sprm.CIco:
        props.ico = u8(operand);
        break;
      case Sprm.CCv:
        props.cv = colorRef(operand);
        break;
      case Sprm.CHighlight:
        props.highlight = u8(operand);
        break;
      case Sprm.CRgFtc0:
        props.font = u16(operand);
        break;
      case Sprm.CRgFtc2:
        props.fontOther = u16(operand);
        break;
      case Sprm.CIstd:
        props.style = u16(operand);
        break;
      default:
    }
  }
}

/** Applies the paragraph sprms of a grpprl to `props`, in order. */
export function applyParaSprms(props: ParaProps, grpprl: Uint8Array): void {
  for (const { sprm, operand } of readSprms(grpprl)) {
    switch (sprm) {
      case Sprm.PJc80:
        props.jc80 = u8(operand);
        break;
      case Sprm.PJc:
        props.jc = u8(operand);
        break;
      case Sprm.PDxaLeft80:
        props.left80 = i16(operand);
        break;
      case Sprm.PDxaLeft:
        props.left = i16(operand);
        break;
      case Sprm.PDxaRight80:
        props.right80 = i16(operand);
        break;
      case Sprm.PDxaRight:
        props.right = i16(operand);
        break;
      case Sprm.PDxaLeft180:
        props.first80 = i16(operand);
        break;
      case Sprm.PDxaLeft1:
        props.first = i16(operand);
        break;
      case Sprm.PDyaBefore:
        props.before = u16(operand);
        break;
      case Sprm.PDyaAfter:
        props.after = u16(operand);
        break;
      case Sprm.PDyaLine:
        // An `LSPD`: the line spacing, then whether it is a multiple of the single line (240 units).
        props.line = i16(operand);
        props.lineMultiple = u16(operand.subarray(2)) === 1;
        break;
      case Sprm.POutLvl:
        props.outline = u8(operand);
        break;
      case Sprm.PFPageBreakBefore:
        props.pageBreakBefore = u8(operand) !== 0;
        break;
      default:
    }
  }
}

/**
 * A character's properties: the paragraph style's character properties (base styles first), the character style, then
 * each of `grpprls` in order (the run's, then the piece's).
 */
export function resolveCharProps(styles: StyleSheet, paragraphIstd: number, grpprls: readonly Uint8Array[]): CharProps {
  const props: CharProps = {};
  for (const style of styles.chain(paragraphIstd))
    if (style.kind === 'paragraph') applyCharSprms(props, style.charGrpprl);
  let characterStyle: number | undefined;
  for (const grpprl of grpprls) characterStyle = characterStyleOf(grpprl) ?? characterStyle;
  for (const style of styles.chain(characterStyle))
    if (style.kind === 'character') applyCharSprms(props, style.charGrpprl);
  for (const grpprl of grpprls) applyCharSprms(props, grpprl);
  return props;
}

/** A paragraph's properties: its style's (base styles first), then the paragraph's own sprms. */
export function resolveParaProps(styles: StyleSheet, istd: number, grpprl: Uint8Array): ParaProps {
  const props: ParaProps = {};
  for (const style of styles.chain(istd)) if (style.kind === 'paragraph') applyParaSprms(props, style.paraGrpprl);
  applyParaSprms(props, grpprl);
  return props;
}

/** The marks for resolved character properties (only what differs from the defaults), and whether the text is dropped. */
export function marksOf(props: CharProps, fonts: readonly string[]): { marks?: Marks; dropped: boolean } {
  const dropped = props.hidden === true || props.deleted === true;
  const marks: Marks = {};
  if (props.bold) marks.bold = true;
  if (props.italic) marks.italic = true;
  if (props.underline) marks.underline = true;
  if (props.strike) marks.strike = true;
  if (props.script === 'super') marks.superscript = true;
  if (props.script === 'sub') marks.subscript = true;
  const color = props.cv === undefined ? PALETTE[props.ico ?? 0] : props.cv === 'auto' ? undefined : props.cv;
  if (color) marks.color = color;
  const highlight = PALETTE[props.highlight ?? 0];
  if (highlight) marks.highlight = highlight;
  const family = fonts[props.font ?? props.fontOther ?? -1];
  if (family) marks.fontFamily = family;
  const size = halfPointsToPt(props.size !== undefined && props.size > 0 ? props.size : DEFAULT_SIZE_HPS);
  if (Math.abs(size - BASE_FONT_PT) > 0.01) marks.fontSizePt = size;
  return Object.keys(marks).length > 0 ? { marks, dropped } : { dropped };
}

/** The paragraph fields of the model for resolved properties; `styleNames` are the style and its base styles, nearest first. */
export function paragraphFields(props: ParaProps, styleNames: readonly string[]): Omit<Paragraph, 'kind' | 'inlines'> {
  const fields: Omit<Paragraph, 'kind' | 'inlines'> = {};
  const level = headingLevelFor({
    outlineLevel: props.outline === undefined ? undefined : props.outline + 1,
    styleNames,
  });
  if (level !== undefined) fields.headingLevel = level;
  const jc = props.jc ?? props.jc80;
  if (jc === 1) fields.align = 'center';
  else if (jc === 2) fields.align = 'right';
  else if (jc !== undefined && jc >= JUSTIFY_FIRST && jc <= JUSTIFY_LAST) fields.align = 'justify';
  const left = nonZero(props.left ?? props.left80);
  if (left !== undefined) fields.indentLeftMm = round(twipsToMm(left));
  const right = nonZero(props.right ?? props.right80);
  if (right !== undefined) fields.indentRightMm = round(twipsToMm(right));
  const first = nonZero(props.first ?? props.first80);
  if (first !== undefined) fields.firstLineMm = round(twipsToMm(first));
  const before = nonZero(props.before);
  if (before !== undefined) fields.spaceBeforePt = round(twipsToPt(before));
  const after = nonZero(props.after);
  if (after !== undefined) fields.spaceAfterPt = round(twipsToPt(after));
  if (props.lineMultiple && props.line !== undefined && props.line > 0) {
    const multiple = props.line / 240;
    if (Math.abs(multiple - 1) > 0.001) fields.lineHeight = round(multiple);
  }
  return fields;
}

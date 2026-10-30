import { DocumentError } from '../../document-error';
import type {
  Block,
  DocumentModel,
  Inline,
  Marks,
  Note,
  PageSetup,
  Paragraph,
  TextRun,
} from '../../model/document-model';
import { bulletFor } from '../shared/bullets';
import { headingLevelFor } from '../shared/heading-rule';
import { halfPointsToPt, twipsToMm, twipsToPt } from '../shared/units';
import { codePageOfCharset, DEFAULT_CODE_PAGE, decodeBytes } from './rtf-code-pages';
import { hyperlinkOf } from './rtf-fields';
import { applyCharWord, applyParaWord, type CharProps, type ParaProps } from './rtf-properties';
import { newPictureDraft, pictureKind, pictureToImage, type PictureDraft } from './rtf-pictures';
import { StyleSheet, type Style } from './rtf-styles';
import { buildTable, newRowDef, type CellDef, type RawRow, type RowDef } from './rtf-tables';
import { tokenize, type RtfToken } from './rtf-tokenizer';

/** What the text and words of a group are for. */
type Dest =
  | 'body'
  /** Everything in the group, nested groups included, is ignored. */
  | 'skip'
  /** Text is ignored; control words and nested groups still count. */
  | 'drop'
  | 'fonttbl'
  | 'fontEntry'
  | 'colortbl'
  | 'stylesheet'
  | 'styleEntry'
  | 'info'
  | 'title'
  | 'listtext'
  | 'fldinst'
  | 'pict'
  | 'bookmark'
  | 'nesttableprops';

interface StyleDraft {
  kind: Style['kind'] | 'table';
  index?: number;
  basedOn?: number;
  parts: string[];
}

interface Cache {
  /** Style and direct character properties merged. */
  eff: CharProps;
  marks: Marks | undefined;
}

interface GroupState {
  dest: Dest;
  char: CharProps;
  para: ParaProps;
  /** `\ucN`: fallback characters to skip after `\uN`. */
  uc: number;
  /** True right after `\*`. */
  star: boolean;
  cache: Cache | null;
  styleDraft?: StyleDraft;
  onClose?: (state: GroupState) => void;
}

interface Field {
  instruction: string[];
  href?: string;
}

/** Table rows and the cell being filled, at one nesting level. */
class TableBuilder {
  readonly rows: RawRow[] = [];
  cells: Block[][] = [];
  cellBlocks: Block[] = [];
}

/** Collects the inlines of one paragraph, merging neighbouring text with equal marks. */
class InlineSink {
  private inlines: Inline[] = [];
  private parts: string[] = [];
  private marks: Marks | undefined;
  private open = false;

  get isEmpty(): boolean {
    return !this.open && this.inlines.length === 0;
  }

  text(text: string, marks: Marks | undefined): void {
    if (text === '') return;
    if (this.open && (this.marks === marks || JSON.stringify(this.marks) === JSON.stringify(marks))) {
      this.parts.push(text);
      return;
    }
    this.flush();
    this.parts.push(text);
    this.marks = marks;
    this.open = true;
  }

  push(inline: Inline): void {
    this.flush();
    this.inlines.push(inline);
  }

  finish(): Inline[] {
    this.flush();
    const inlines = this.inlines;
    this.inlines = [];
    return inlines;
  }

  private flush(): void {
    if (!this.open) return;
    const run: TextRun = { kind: 'text', text: this.parts.join('') };
    if (this.marks) run.marks = { ...this.marks };
    this.inlines.push(run);
    this.parts = [];
    this.open = false;
  }
}

/** The place blocks go: the body or one footnote. */
class Frame {
  readonly blocks: Block[] = [];
  /** The paragraph's inlines; a link being read has a sink of its own on top. */
  readonly sinks: InlineSink[] = [new InlineSink()];
  readonly tables: TableBuilder[] = [];
  /** The `\listtext` of the paragraph being read. */
  marker: string | undefined;
  /** The level from `\pnlvl` of the paragraph being read. */
  pnLevel: number | undefined;
  /** True right after a page break, so that a following empty `\par` doesn't add a blank paragraph. */
  afterBreak = false;

  constructor(readonly isNote: boolean) {}

  get sink(): InlineSink {
    return this.sinks[this.sinks.length - 1] as InlineSink;
  }
}

/** Bytes waiting to be decoded together, in the code page that is current when they are flushed. */
class ByteBuffer {
  private parts: Uint8Array[] = [];
  private run: number[] = [];

  get isEmpty(): boolean {
    return this.parts.length === 0 && this.run.length === 0;
  }

  addBytes(bytes: Uint8Array): void {
    this.sealRun();
    this.parts.push(bytes);
  }

  addByte(byte: number): void {
    this.run.push(byte);
  }

  take(): Uint8Array {
    this.sealRun();
    const parts = this.parts;
    this.parts = [];
    if (parts.length === 1) return parts[0] as Uint8Array;
    const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    for (const part of parts) {
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  }

  private sealRun(): void {
    if (this.run.length === 0) return;
    this.parts.push(Uint8Array.from(this.run));
    this.run = [];
  }
}

/** Groups whose whole content is ignored. */
const SKIPPED = new Set([
  'header',
  'headerl',
  'headerr',
  'headerf',
  'footer',
  'footerl',
  'footerr',
  'footerf',
  'annotation',
  'atnid',
  'atnauthor',
  'atndate',
  'atntime',
  'atnicn',
  'atnparent',
  'atnref',
  'shp',
  'shpinst',
  'do',
  'themedata',
  'colorschememapping',
  'latentstyles',
  'datastore',
  'xmlnstbl',
  'rsidtbl',
  'generator',
  'pgdsctbl',
  'listtable',
  'listoverridetable',
  'revtbl',
  'nonshppict',
  'nonesttables',
  'ftnsep',
  'ftnsepc',
  'aftnsep',
  'aftnsepc',
  'ftncn',
  'aftncn',
  'userprops',
  'filetbl',
  'xe',
  'tc',
  'tcn',
  'rxe',
  'bxe',
  'txe',
  'pxe',
]);

/** Words that put a character in the text. */
const CHARACTERS: Record<string, string> = {
  emdash: '—',
  endash: '–',
  emspace: ' ',
  enspace: ' ',
  qmspace: ' ',
  bullet: '•',
  lquote: '‘',
  rquote: '’',
  ldblquote: '“',
  rdblquote: '”',
  zwj: '‍',
  zwnj: '‌',
  ltrmark: '‎',
  rtlmark: '‏',
};

const SYMBOL_CHARACTERS: Record<string, string> = {
  '\\': '\\',
  '{': '{',
  '}': '}',
  '~': ' ',
  '-': '­',
  _: '‑',
};

/** The cell properties that start or continue a merge. */
const CELL_MERGES: Record<string, Pick<CellDef, 'hMerge' | 'vMerge'>> = {
  clmgf: { hMerge: 'first' },
  clmrg: { hMerge: 'continue' },
  clvmgf: { vMerge: 'first' },
  clvmrg: { vMerge: 'continue' },
};

const MAX_DEPTH = 1000;
const ABORT_CHECK_MASK = 0xfff;
/** Default font size when nothing sets one: 12 pt. */
const DEFAULT_SIZE = 24;
/** The size the renderers use for text without a size mark. */
const BASE_FONT_PT = 11;

const round = (value: number) => Math.round(value * 1000) / 1000;
const nonZero = (value: number | undefined) => (value === undefined || Math.abs(value) < 0.001 ? undefined : value);
const hex2 = (value: number) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0');

/** Reads RTF tokens into the document model. */
export class RtfInterpreter {
  private readonly stack: GroupState[] = [];
  private readonly frames: Frame[] = [new Frame(false)];
  private readonly bytes = new ByteBuffer();
  private readonly styles = new StyleSheet();
  private readonly fonts = new Map<number, { name: string; charset: number | undefined }>();
  private readonly colors: (string | undefined)[] = [];
  private readonly notes: Note[] = [];
  private readonly fields: Field[] = [];
  /** Row definitions by table nesting level (index 0 is the outer table). */
  private readonly rowDefs: RowDef[] = [];
  private readonly pageValues: Partial<Record<'w' | 'h' | 't' | 'r' | 'b' | 'l', number>> = {};

  private docCodePage = DEFAULT_CODE_PAGE;
  private defaultFont: number | undefined;
  private title: string | undefined;
  private done = false;
  /** Fallback characters still to skip after a `\u`. */
  private skip = 0;
  private fontDraft: { index?: number; charset?: number; parts: string[] } = { parts: [] };
  private colorDraft: { red?: number; green?: number; blue?: number } = {};
  private titleParts: string[] = [];
  private listParts: string[] = [];
  private bookmarkParts: string[] = [];
  private picture: PictureDraft = newPictureDraft();

  private get state(): GroupState {
    return this.stack[this.stack.length - 1] as GroupState;
  }

  private get frame(): Frame {
    return this.frames[this.frames.length - 1] as Frame;
  }

  run(input: Uint8Array, signal: AbortSignal): DocumentModel {
    let count = 0;
    for (const token of tokenize(input)) {
      if ((++count & ABORT_CHECK_MASK) === 0) signal.throwIfAborted();
      this.handle(token);
      if (this.done) break;
    }
    if (!this.done) {
      // The groups never closed: tolerated when something was read, otherwise the file is cut off in its header.
      if (!this.hasContent()) throw new DocumentError('corrupt', 'The RTF file ends before any text.');
      while (this.stack.length > 0 && !this.done) this.close();
    }
    return this.model();
  }

  private hasContent(): boolean {
    const body = this.frames[0] as Frame;
    return body.blocks.length > 0 || body.tables.length > 0 || !body.sinks[0]?.isEmpty || this.notes.length > 0;
  }

  private model(): DocumentModel {
    const body = this.frames[0] as Frame;
    const model: DocumentModel = { page: this.page(), blocks: body.blocks, notes: this.notes };
    if (this.title) model.title = this.title;
    return model;
  }

  private page(): PageSetup {
    const { w, h, t, r, b, l } = this.pageValues;
    return {
      widthMm: round(twipsToMm(w ?? 11906)),
      heightMm: round(twipsToMm(h ?? 16838)),
      marginTopMm: round(twipsToMm(t ?? 1440)),
      marginRightMm: round(twipsToMm(r ?? 1440)),
      marginBottomMm: round(twipsToMm(b ?? 1440)),
      marginLeftMm: round(twipsToMm(l ?? 1440)),
    };
  }

  // --- tokens ---

  private handle(token: RtfToken): void {
    switch (token.kind) {
      case 'open':
        this.open();
        return;
      case 'close':
        if (this.stack.length > 0) this.close();
        return;
      case 'text':
        this.text(token.bytes);
        return;
      case 'hex':
        this.hex(token.value);
        return;
      case 'bin':
        if (this.stack.length === 0 || this.state.dest === 'skip') return;
        if (this.state.dest === 'pict') this.picture.chunks.push({ hex: false, data: token.data });
        return;
      case 'word':
        this.flushBytes();
        this.skip = 0;
        if (this.stack.length > 0 && this.state.dest !== 'skip') this.word(token.name, token.param);
        return;
      case 'symbol':
        this.flushBytes();
        this.skip = 0;
        if (this.stack.length > 0 && this.state.dest !== 'skip') this.symbol(token.char);
        return;
    }
  }

  private open(): void {
    if (this.stack.length >= MAX_DEPTH) throw new DocumentError('corrupt', 'RTF groups are nested too deeply.');
    this.flushBytes();
    this.skip = 0;
    const parent = this.stack[this.stack.length - 1];
    if (!parent) {
      this.stack.push({ dest: 'body', char: {}, para: {}, uc: 1, star: false, cache: null });
      return;
    }
    if (parent.dest === 'skip') {
      this.stack.push({ dest: 'skip', char: parent.char, para: parent.para, uc: parent.uc, star: false, cache: null });
      return;
    }
    const child: GroupState = {
      dest: parent.dest,
      char: { ...parent.char },
      para: { ...parent.para },
      uc: parent.uc,
      star: false,
      cache: parent.cache,
    };
    if (parent.dest === 'stylesheet') {
      child.dest = 'styleEntry';
      child.char = {};
      child.para = {};
      child.cache = null;
      const draft: StyleDraft = { kind: 'paragraph', parts: [] };
      child.styleDraft = draft;
      child.onClose = (state) => this.registerStyle(draft, state);
    } else if (parent.dest === 'fonttbl') {
      child.dest = 'fontEntry';
      child.onClose = () => this.commitFont();
    }
    this.stack.push(child);
  }

  private close(): void {
    this.flushBytes();
    this.skip = 0;
    if (this.stack.length === 1) this.finishBody();
    const state = this.stack.pop() as GroupState;
    state.onClose?.(state);
    if (this.stack.length === 0) this.done = true;
  }

  private text(data: Uint8Array): void {
    if (this.stack.length === 0) return;
    const dest = this.state.dest;
    if (dest === 'skip') return;
    if (dest === 'pict') {
      this.picture.chunks.push({ hex: true, data });
      return;
    }
    if (this.skip > 0) {
      const n = Math.min(this.skip, data.length);
      this.skip -= n;
      data = data.subarray(n);
      if (data.length === 0) return;
    }
    this.bytes.addBytes(data);
  }

  private hex(value: number): void {
    if (this.stack.length === 0 || this.state.dest === 'skip' || this.state.dest === 'pict') return;
    if (this.skip > 0) {
      this.skip--;
      return;
    }
    this.bytes.addByte(value);
  }

  private flushBytes(): void {
    if (this.bytes.isEmpty) return;
    const data = this.bytes.take();
    if (this.stack.length === 0) return;
    this.emitText(decodeBytes(data, this.codePage(this.state)));
  }

  private codePage(state: GroupState): number {
    const font = this.cache(state).eff.font ?? this.defaultFont;
    const charset = font === undefined ? undefined : this.fonts.get(font)?.charset;
    return codePageOfCharset(charset) ?? this.docCodePage;
  }

  // --- formatting ---

  private cache(state: GroupState): Cache {
    if (state.cache) return state.cache;
    const style = this.styles.paragraph(state.para.style ?? 0).char;
    const charStyle = state.char.style === undefined ? undefined : this.styles.character(state.char.style).char;
    const eff: CharProps = { ...style, ...charStyle, ...state.char };
    state.cache = { eff, marks: this.marksOf(eff) };
    return state.cache;
  }

  private colorOf(index: number | undefined): string | undefined {
    return index !== undefined && index > 0 ? this.colors[index] : undefined;
  }

  private marksOf(eff: CharProps): Marks | undefined {
    const marks: Marks = {};
    if (eff.bold) marks.bold = true;
    if (eff.italic) marks.italic = true;
    if (eff.underline) marks.underline = true;
    if (eff.strike) marks.strike = true;
    if (eff.script === 'super') marks.superscript = true;
    if (eff.script === 'sub') marks.subscript = true;
    const color = this.colorOf(eff.color);
    if (color) marks.color = color;
    const highlight = this.colorOf(eff.highlight) ?? this.colorOf(eff.shade);
    if (highlight) marks.highlight = highlight;
    const font = eff.font ?? this.defaultFont;
    const family = font === undefined ? undefined : this.fonts.get(font)?.name;
    if (family) marks.fontFamily = family;
    const size = halfPointsToPt(eff.size !== undefined && eff.size > 0 ? eff.size : DEFAULT_SIZE);
    if (Math.abs(size - BASE_FONT_PT) > 0.01) marks.fontSizePt = size;
    return Object.keys(marks).length > 0 ? marks : undefined;
  }

  private isDropped(state: GroupState): boolean {
    const { eff } = this.cache(state);
    return eff.hidden === true || eff.deleted === true;
  }

  // --- text ---

  private emitText(text: string): void {
    const state = this.state;
    switch (state.dest) {
      case 'body': {
        const cache = this.cache(state);
        if (cache.eff.hidden || cache.eff.deleted) return;
        this.frame.sink.text(text, cache.marks);
        return;
      }
      case 'listtext':
        this.listParts.push(text);
        return;
      case 'fldinst':
        this.fields[this.fields.length - 1]?.instruction.push(text);
        return;
      case 'fonttbl':
      case 'fontEntry':
        this.fontText(text);
        return;
      case 'colortbl':
        this.colorText(text);
        return;
      case 'styleEntry':
        state.styleDraft?.parts.push(text);
        return;
      case 'title':
        this.titleParts.push(text);
        return;
      case 'bookmark':
        this.bookmarkParts.push(text);
        return;
      default:
    }
  }

  private inline(inline: Inline): void {
    const state = this.state;
    if (state.dest !== 'body' || this.isDropped(state)) return;
    this.frame.sink.push(inline);
  }

  private symbol(char: string): void {
    if (char === '*') {
      this.state.star = true;
      return;
    }
    this.state.star = false;
    const text = SYMBOL_CHARACTERS[char];
    if (text !== undefined) this.emitText(text);
  }

  // --- words ---

  private word(name: string, param: number | undefined): void {
    const state = this.state;
    if (state.star) {
      state.star = false;
      // An ignorable destination we know is read; any other is skipped. Style entries start with `\*\cs`.
      if (!this.startDestination(state, name) && !(state.dest === 'styleEntry' && (name === 'cs' || name === 'ts'))) {
        state.dest = 'skip';
        return;
      }
      if (state.dest !== 'styleEntry') return;
    } else if (this.startDestination(state, name)) {
      return;
    }
    switch (state.dest) {
      case 'fonttbl':
      case 'fontEntry':
        this.fontWord(name, param);
        return;
      case 'colortbl':
        if (param !== undefined && (name === 'red' || name === 'green' || name === 'blue')) {
          this.colorDraft[name] = param;
        }
        return;
      case 'pict':
        this.pictureWord(name, param);
        return;
      case 'styleEntry':
        if (this.styleWord(state, name, param)) return;
        break;
      default:
    }
    this.formattingWord(state, name, param);
  }

  private formattingWord(state: GroupState, name: string, param: number | undefined): void {
    if (applyCharWord(state.char, name, param)) {
      state.cache = null;
      return;
    }
    if (name === 'plain') {
      state.char = {};
      state.cache = null;
      return;
    }
    if (name === 'pard') {
      state.para = {};
      state.cache = null;
      return;
    }
    if (applyParaWord(state.para, name, param)) {
      state.cache = null;
      return;
    }
    const character = CHARACTERS[name];
    if (character !== undefined) {
      this.emitText(character);
      return;
    }
    this.structureWord(state, name, param);
  }

  private structureWord(state: GroupState, name: string, param: number | undefined): void {
    const inBody = state.dest === 'body';
    const inRowProps = inBody || state.dest === 'nesttableprops';
    switch (name) {
      case 'u':
        if (param !== undefined) {
          this.emitText(String.fromCharCode(param < 0 ? param + 65536 : param));
          this.skip = state.uc;
        }
        return;
      case 'uc':
        state.uc = param ?? 1;
        return;
      case 'par':
        if (inBody) this.endParagraph('paragraph');
        return;
      case 'sect':
        if (inBody) this.endParagraph('soft');
        return;
      case 'page':
        if (inBody) this.pageBreak();
        return;
      case 'line':
        this.inline({ kind: 'lineBreak' });
        return;
      case 'tab':
        if (state.dest === 'listtext') this.listParts.push('\t');
        else this.inline({ kind: 'tab' });
        return;
      case 'cell':
        if (inBody) this.endCell(1);
        return;
      case 'nestcell':
        if (inBody) this.endCell(this.nestedDepth(state));
        return;
      case 'row':
        if (inBody) this.endRow(1);
        return;
      case 'nestrow':
        if (inRowProps) this.endRow(this.nestedDepth(state));
        return;
      case 'trowd':
        if (inRowProps) this.rowDefs[this.rowDefDepth(state) - 1] = newRowDef();
        return;
      case 'cellx':
        if (inRowProps && param !== undefined) {
          const def = this.rowDef(this.rowDefDepth(state));
          def.cells.push({ right: param, ...def.pending });
          def.pending = {};
        }
        return;
      case 'clmgf':
      case 'clmrg':
      case 'clvmgf':
      case 'clvmrg':
      case 'clcbpat':
        if (inRowProps) this.cellProperty(state, name, param);
        return;
      case 'trleft':
        if (inRowProps && param !== undefined) this.rowDef(this.rowDefDepth(state)).left = param;
        return;
      case 'trhdr':
        if (inRowProps) this.rowDef(this.rowDefDepth(state)).header = true;
        return;
      case 'chftn':
        return;
      case 'pnlvl':
        if (param !== undefined && param >= 1) this.frame.pnLevel = param - 1;
        return;
      case 'pnlvlblt':
      case 'pnlvlbody':
        this.frame.pnLevel = 0;
        return;
      case 'ansicpg':
        if (param !== undefined) this.docCodePage = param;
        return;
      case 'mac':
        this.docCodePage = 10000;
        return;
      case 'pc':
        this.docCodePage = 437;
        return;
      case 'pca':
        this.docCodePage = 850;
        return;
      case 'deff':
        if (param !== undefined) this.defaultFont = param;
        return;
      case 'paperw':
      case 'paperh':
      case 'margl':
      case 'margr':
      case 'margt':
      case 'margb':
        // The first value wins: later ones belong to other sections.
        if (param !== undefined)
          this.pageValues[name === 'paperw' ? 'w' : name === 'paperh' ? 'h' : (name.slice(4, 5) as 'l')] ??= param;
        return;
      default:
    }
  }

  // --- destinations ---

  /** Makes the group a destination if `name` starts one; false for any other word. */
  private startDestination(state: GroupState, name: string): boolean {
    switch (name) {
      case 'fonttbl':
        state.dest = 'fonttbl';
        return true;
      case 'colortbl':
        state.dest = 'colortbl';
        this.colorDraft = {};
        return true;
      case 'stylesheet':
        state.dest = 'stylesheet';
        return true;
      case 'info':
        state.dest = 'info';
        return true;
      case 'title':
        if (state.dest !== 'info') return false;
        state.dest = 'title';
        this.titleParts = [];
        state.onClose = () => {
          const title = this.titleParts.join('').trim();
          if (title) this.title = title;
        };
        return true;
      case 'listtext':
      case 'pntext': {
        const frame = this.frame;
        state.dest = 'listtext';
        this.listParts = [];
        state.onClose = () => {
          const marker = this.listParts.join('').trim();
          if (marker) frame.marker = marker;
        };
        return true;
      }
      case 'pn':
      case 'object':
        state.dest = 'drop';
        return true;
      case 'result':
      case 'shppict':
        state.dest = 'body';
        return true;
      case 'nesttableprops':
        state.dest = 'nesttableprops';
        return true;
      case 'field':
        this.startField(state);
        return true;
      case 'fldinst':
        state.dest = 'fldinst';
        state.onClose = () => {
          const field = this.fields[this.fields.length - 1];
          const href = field && hyperlinkOf(field.instruction.join(''));
          if (field && href) field.href = href;
        };
        return true;
      case 'fldrslt':
        this.startFieldResult(state);
        return true;
      case 'pict':
        this.startPicture(state);
        return true;
      case 'bkmkstart': {
        const frame = this.frame;
        state.dest = 'bookmark';
        this.bookmarkParts = [];
        state.onClose = () => {
          const id = this.bookmarkParts.join('').trim();
          if (id && !this.isDropped(state)) frame.sink.push({ kind: 'anchor', id });
        };
        return true;
      }
      case 'footnote':
        this.startFootnote(state);
        return true;
      default:
        if (SKIPPED.has(name)) {
          state.dest = 'skip';
          return true;
        }
        return false;
    }
  }

  private startField(state: GroupState): void {
    state.dest = 'drop';
    this.fields.push({ instruction: [] });
    state.onClose = () => {
      this.fields.pop();
    };
  }

  private startFieldResult(state: GroupState): void {
    state.dest = 'body';
    const href = this.fields[this.fields.length - 1]?.href;
    if (!href) return;
    const frame = this.frame;
    frame.sinks.push(new InlineSink());
    state.onClose = () => {
      const sink = frame.sinks.pop() as InlineSink;
      const inlines = sink.finish();
      if (inlines.length > 0) frame.sink.push({ kind: 'link', href, inlines });
    };
  }

  private startPicture(state: GroupState): void {
    state.dest = 'pict';
    this.picture = newPictureDraft();
    const draft = this.picture;
    state.onClose = (closing) => {
      const dropped = this.isDropped(closing);
      if (dropped || closing.dest !== 'pict') return;
      const image = pictureToImage(draft);
      if (image.src || image.widthPx > 0 || image.heightPx > 0) this.frame.sink.push(image);
    };
  }

  private pictureWord(name: string, param: number | undefined): void {
    const draft = this.picture;
    const kind = pictureKind(name);
    if (kind) {
      draft.kind = kind;
      return;
    }
    if (param === undefined) return;
    switch (name) {
      case 'picwgoal':
        draft.widthGoal = param;
        return;
      case 'pichgoal':
        draft.heightGoal = param;
        return;
      case 'picw':
        draft.width = param;
        return;
      case 'pich':
        draft.height = param;
        return;
      case 'picscalex':
        draft.scaleX = param;
        return;
      case 'picscaley':
        draft.scaleY = param;
        return;
      default:
    }
  }

  private startFootnote(state: GroupState): void {
    if (state.dest !== 'body' || this.frame.isNote || this.isDropped(state)) {
      state.dest = 'skip';
      return;
    }
    const number = this.notes.length + 1;
    const id = `fn${number}`;
    const label = String(number);
    // The reference is the `\chftn` just before the note; here it is made when the note starts.
    this.frame.sink.push({ kind: 'noteRef', noteId: id, label });
    const frame = new Frame(true);
    this.frames.push(frame);
    state.dest = 'body';
    state.char = {};
    state.para = {};
    state.cache = null;
    state.onClose = (closing) => {
      this.finishFrame(frame, closing);
      this.frames.pop();
      const blocks = frame.blocks;
      const last = blocks[blocks.length - 1];
      if (blocks.length > 1 && last?.kind === 'paragraph' && last.inlines.length === 0) blocks.pop();
      // The text usually starts with a space that separates it from the reference mark.
      const first = blocks[0];
      const lead = first?.kind === 'paragraph' ? first.inlines[0] : undefined;
      if (lead?.kind === 'text') {
        lead.text = lead.text.trimStart();
        if (lead.text === '') (first as Paragraph).inlines.shift();
      }
      this.notes.push({ id, label, blocks });
    };
  }

  // --- font, colour and style tables ---

  private fontWord(name: string, param: number | undefined): void {
    if (name === 'f' && param !== undefined) {
      if (this.fontDraft.index !== undefined) this.commitFont();
      this.fontDraft.index = param;
    } else if (name === 'fcharset' && param !== undefined) {
      this.fontDraft.charset = param;
    }
  }

  private fontText(text: string): void {
    const pieces = text.split(';');
    pieces.forEach((piece, i) => {
      this.fontDraft.parts.push(piece);
      if (i < pieces.length - 1) this.commitFont();
    });
  }

  private commitFont(): void {
    const { index, charset, parts } = this.fontDraft;
    this.fontDraft = { parts: [] };
    if (index === undefined) return;
    const name = parts.join('').trim();
    if (name) this.fonts.set(index, { name, charset });
  }

  private colorText(text: string): void {
    for (const char of text) {
      if (char !== ';') continue;
      const { red, green, blue } = this.colorDraft;
      const set = red !== undefined || green !== undefined || blue !== undefined;
      this.colors.push(set ? `#${hex2(red ?? 0)}${hex2(green ?? 0)}${hex2(blue ?? 0)}` : undefined);
      this.colorDraft = {};
    }
  }

  /** Handles the words that mean something only in a style entry; false for the others. */
  private styleWord(state: GroupState, name: string, param: number | undefined): boolean {
    const draft = state.styleDraft;
    if (!draft) return false;
    switch (name) {
      case 's':
        draft.kind = 'paragraph';
        if (param !== undefined) draft.index = param;
        return true;
      case 'cs':
        draft.kind = 'character';
        if (param !== undefined) draft.index = param;
        return true;
      case 'ts':
        draft.kind = 'table';
        if (param !== undefined) draft.index = param;
        return true;
      case 'sbasedon':
        if (param !== undefined) draft.basedOn = param;
        return true;
      default:
        return false;
    }
  }

  private registerStyle(draft: StyleDraft, state: GroupState): void {
    if (draft.kind === 'table' || draft.index === undefined) return;
    const style: Style = {
      kind: draft.kind,
      index: draft.index,
      name: draft.parts.join('').split(';')[0]?.trim() ?? '',
      char: state.char,
      para: state.para,
    };
    if (draft.basedOn !== undefined) style.basedOn = draft.basedOn;
    this.styles.add(style);
  }

  // --- paragraphs and blocks ---

  private depthOf(state: GroupState): number {
    const itap = state.para.itap ?? 0;
    return state.para.inTable || itap > 0 ? Math.max(itap, 1) : 0;
  }

  private nestedDepth(state: GroupState): number {
    return Math.max(state.para.itap ?? 2, 2);
  }

  /** The nesting level a row definition word belongs to: inside `\nesttableprops` it is the paragraph's level. */
  private rowDefDepth(state: GroupState): number {
    return state.dest === 'nesttableprops' ? this.nestedDepth(state) : 1;
  }

  private rowDef(depth: number): RowDef {
    return (this.rowDefs[depth - 1] ??= newRowDef());
  }

  private cellProperty(state: GroupState, name: string, param: number | undefined): void {
    const pending: RowDef['pending'] = this.rowDef(this.rowDefDepth(state)).pending;
    const merge = CELL_MERGES[name];
    if (merge) Object.assign(pending, merge);
    else if (name === 'clcbpat') {
      const color = this.colorOf(param);
      if (color) pending.background = color;
    }
  }

  private makeParagraph(frame: Frame, state: GroupState, inlines: Inline[]): Paragraph {
    const style = this.styles.paragraph(state.para.style ?? 0);
    const props: ParaProps = { ...style.para, ...state.para };
    const paragraph: Paragraph = { kind: 'paragraph', inlines };
    const level = headingLevelFor({
      outlineLevel: props.outline === undefined ? undefined : props.outline + 1,
      styleNames: style.names,
    });
    if (level !== undefined) paragraph.headingLevel = level;
    if (props.align && props.align !== 'left') paragraph.align = props.align;
    const left = nonZero(props.leftIn ?? props.left);
    if (left !== undefined) paragraph.indentLeftMm = round(twipsToMm(left));
    const right = nonZero(props.rightIn ?? props.right);
    if (right !== undefined) paragraph.indentRightMm = round(twipsToMm(right));
    const first = nonZero(props.first);
    if (first !== undefined) paragraph.firstLineMm = round(twipsToMm(first));
    const before = nonZero(props.before);
    if (before !== undefined) paragraph.spaceBeforePt = round(twipsToPt(before));
    const after = nonZero(props.after);
    if (after !== undefined) paragraph.spaceAfterPt = round(twipsToPt(after));
    if (props.lineMultiple && props.line !== undefined && props.line > 0) {
      const multiple = props.line / 240;
      if (Math.abs(multiple - 1) > 0.001) paragraph.lineHeight = round(multiple);
    }
    if (frame.marker !== undefined) {
      const bullet = bulletFor(frame.marker);
      paragraph.list = {
        level: state.para.level ?? frame.pnLevel ?? 0,
        marker: bullet ?? frame.marker,
        ordered: bullet === undefined,
      };
    }
    return paragraph;
  }

  /** Puts a block in the frame at a table nesting depth (0 is outside any table). */
  private addBlock(frame: Frame, depth: number, block: Block): void {
    this.openTables(frame, depth);
    const target = depth === 0 ? frame.blocks : (frame.tables[depth - 1] as TableBuilder).cellBlocks;
    target.push(block);
  }

  /** Closes tables deeper than `depth` and opens missing ones down to it. */
  private openTables(frame: Frame, depth: number): void {
    this.closeTables(frame, depth);
    while (frame.tables.length < depth) frame.tables.push(new TableBuilder());
  }

  private closeTables(frame: Frame, depth: number): void {
    while (frame.tables.length > depth) {
      const builder = frame.tables.pop() as TableBuilder;
      if (builder.cellBlocks.length > 0) builder.cells.push(builder.cellBlocks);
      if (builder.cells.length > 0) {
        builder.rows.push({ def: this.rowDefs[frame.tables.length] ?? newRowDef(), cells: builder.cells });
      }
      if (builder.rows.length === 0) continue;
      const table = buildTable(builder.rows);
      const parent = frame.tables[frame.tables.length - 1];
      (parent ? parent.cellBlocks : frame.blocks).push(table);
    }
  }

  /** `paragraph`: always ends it; `soft`: only when it has content. */
  private endParagraph(kind: 'paragraph' | 'soft'): void {
    const frame = this.frame;
    const state = this.state;
    const inlines = (frame.sinks[0] as InlineSink).finish();
    const hasContent = inlines.length > 0 || frame.marker !== undefined;
    if (!hasContent && (kind === 'soft' || frame.afterBreak)) {
      frame.afterBreak = false;
      return;
    }
    frame.afterBreak = false;
    const depth = this.depthOf(state);
    if (state.para.pageBreakBefore && depth === 0) this.addBlock(frame, 0, { kind: 'pageBreak' });
    this.addBlock(frame, depth, this.makeParagraph(frame, state, inlines));
    frame.marker = undefined;
    frame.pnLevel = undefined;
  }

  private pageBreak(): void {
    const frame = this.frame;
    if (this.depthOf(this.state) > 0 || frame.isNote) return;
    this.endParagraph('soft');
    this.addBlock(frame, 0, { kind: 'pageBreak' });
    frame.afterBreak = true;
  }

  /** `\cell` and `\nestcell`: the paragraph being read ends the cell. */
  private endCell(depth: number): void {
    const frame = this.frame;
    const state = this.state;
    this.openTables(frame, depth);
    const builder = frame.tables[depth - 1] as TableBuilder;
    const inlines = (frame.sinks[0] as InlineSink).finish();
    if (inlines.length > 0 || frame.marker !== undefined || builder.cellBlocks.length === 0) {
      builder.cellBlocks.push(this.makeParagraph(frame, state, inlines));
    }
    frame.marker = undefined;
    frame.pnLevel = undefined;
    builder.cells.push(builder.cellBlocks);
    builder.cellBlocks = [];
  }

  /** `\row` and `\nestrow`. */
  private endRow(depth: number): void {
    const frame = this.frame;
    this.closeTables(frame, depth);
    const builder = frame.tables[depth - 1];
    if (!builder) return;
    const pending = !(frame.sinks[0] as InlineSink).isEmpty;
    if (pending) this.endCell(depth);
    if (builder.cells.length === 0) return;
    builder.rows.push({ def: this.rowDef(depth), cells: builder.cells });
    builder.cells = [];
  }

  /** Ends what is being read when the root group closes (or the input ends). */
  private finishBody(): void {
    this.finishFrame(this.frames[0] as Frame, this.state);
  }

  private finishFrame(frame: Frame, state: GroupState): void {
    const inlines = (frame.sinks[0] as InlineSink).finish();
    if (inlines.length > 0 || frame.marker !== undefined) {
      this.addBlock(frame, this.depthOf(state), this.makeParagraph(frame, state, inlines));
      frame.marker = undefined;
    }
    this.closeTables(frame, 0);
  }
}

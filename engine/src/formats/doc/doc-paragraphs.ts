import type { Block, Inline, Link, Marks, Paragraph } from '../../model/document-model';
import { resolveFieldChunks } from './doc-fields';
import { firstRunEndingAfter, type FkpRun } from './doc-fkp';
import { levelOf, ListNumbering, type ListTables } from './doc-lists';
import { marksOf, paragraphFields, resolveCharProps, resolveParaProps } from './doc-properties';
import { prm0Sprm } from './doc-sprm';
import { buildTables, MAX_TABLE_DEPTH, readRowDef, type FlatItem, type RowDef } from './doc-tables';
import type { DocText, Piece } from './doc-text';
import type { StyleSheet } from './doc-styles';

const NON_BREAKING_HYPHEN = '‑';
const NO_PROPS = new Uint8Array(0);

/** Everything the paragraph builder needs to format text. */
export interface DocFormat {
  text: DocText;
  chpx: readonly FkpRun[];
  papx: readonly FkpRun[];
  styles: StyleSheet;
  fonts: readonly string[];
  /** `PlfLst` and `PlfLfo`; without them paragraphs are not list items. */
  lists?: ListTables;
}

/** A stretch of CPs with the same formatting. */
interface Segment {
  from: number;
  to: number;
  marks?: Marks;
  dropped: boolean;
}

/** Where a paragraph sits in a table. */
interface TableInfo {
  /** 0 outside tables. */
  depth: number;
  /** The paragraph ends a cell of a nested table (a cell of the first level ends at `0x07`). */
  innerCell: boolean;
  rowEnd: boolean;
  header: boolean;
  /** The operand of `sprmTDefTable`. */
  def?: Uint8Array;
}

interface ParagraphFormat {
  istd: number;
  fields: Omit<Paragraph, 'kind' | 'inlines'>;
  pageBreakBefore: boolean;
  /** The list the paragraph names; undefined when it is in none. */
  list?: { ilfo: number; ilvl: number };
  table: TableInfo;
}

/** The grpprl a piece's `Prm` adds to its text: a `Prm0` holds one sprm, a `Prm1` points at a `Prc` of the `Clx`. */
function pieceGrpprl(piece: Piece, prcs: readonly Uint8Array[]): Uint8Array {
  if (piece.prm & 1) return prcs[piece.prm >> 1] ?? NO_PROPS;
  const sprm = prm0Sprm((piece.prm >> 1) & 0x7f);
  if (sprm === undefined) return NO_PROPS;
  return Uint8Array.from([sprm & 0xff, sprm >> 8, piece.prm >> 8]);
}

/** Looks up formatting by CP: maps the FKP FC ranges to CPs through the piece table. */
class Formatter {
  private readonly pieceProps: Uint8Array[];
  private readonly marksCache = new Map<string, { marks?: Marks; dropped: boolean }>();
  private readonly paragraphCache = new Map<number, ParagraphFormat>();

  constructor(private readonly format: DocFormat) {
    this.pieceProps = format.text.pieces.map((piece) => pieceGrpprl(piece, format.text.prcs));
  }

  private pieceIndexAt(cp: number): number {
    const { pieces } = this.format.text;
    let low = 0;
    let high = pieces.length - 1;
    let found = -1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if ((pieces[mid] as Piece).cpStart <= cp) {
        found = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return found >= 0 && cp < (pieces[found] as Piece).cpEnd ? found : -1;
  }

  /** The properties of the paragraph whose last character (its mark) is at `cp`. */
  paragraphAt(cp: number): ParagraphFormat {
    const { papx, styles } = this.format;
    const fc = this.format.text.cpToFc(cp);
    let run: FkpRun | undefined;
    let index = -1;
    if (fc !== undefined) {
      index = firstRunEndingAfter(papx, fc);
      run = papx[index];
      if (run && run.fcStart > fc) run = undefined;
    }
    const cached = this.paragraphCache.get(run ? index : -1);
    if (cached) return cached;
    const istd = run?.istd ?? 0;
    const { lists } = this.format;
    const props = resolveParaProps(
      styles,
      istd,
      run?.grpprl ?? NO_PROPS,
      lists && ((ilfo, ilvl) => levelOf(lists, ilfo, ilvl)?.papx),
    );
    const styleNames = styles
      .chain(istd)
      .map((style) => style.name)
      .reverse();
    const rowEnd = props.ttp === true || props.innerTtp === true;
    let depth = props.inTable ? Math.max(props.itap ?? 1, 1) : (props.itap ?? 0);
    if (rowEnd) depth = Math.max(depth, 1);
    const result: ParagraphFormat = {
      istd,
      fields: paragraphFields(props, styleNames),
      pageBreakBefore: props.pageBreakBefore === true,
      table: {
        depth: Math.min(depth, MAX_TABLE_DEPTH),
        innerCell: props.innerCell === true,
        rowEnd,
        header: props.tableHeader === true,
        ...(props.tableDef ? { def: props.tableDef } : {}),
      },
      ...(props.ilfo !== undefined && props.ilfo > 0 ? { list: { ilfo: props.ilfo, ilvl: props.ilvl ?? 0 } } : {}),
    };
    this.paragraphCache.set(run ? index : -1, result);
    return result;
  }

  /** Splits `[from, to)` at every point where the character formatting changes. */
  segments(from: number, to: number, istd: number): Segment[] {
    const { chpx, styles, fonts, text } = this.format;
    const segments: Segment[] = [];
    let cp = from;
    while (cp < to) {
      const pieceIndex = this.pieceIndexAt(cp);
      const piece = text.pieces[pieceIndex];
      if (!piece) {
        segments.push({ from: cp, to, dropped: false });
        break;
      }
      const bytes = piece.compressed ? 1 : 2;
      const fc = piece.fc + (cp - piece.cpStart) * bytes;
      const runIndex = firstRunEndingAfter(chpx, fc);
      const next = chpx[runIndex];
      const covering = next && next.fcStart <= fc ? next : undefined;
      const endFc = covering ? covering.fcEnd : (next?.fcStart ?? Infinity);
      let end = Math.min(to, piece.cpEnd, piece.cpStart + Math.ceil((endFc - piece.fc) / bytes));
      if (end <= cp) end = cp + 1;

      const key = `${istd}:${pieceIndex}:${covering ? runIndex : 'gap'}`;
      let resolved = this.marksCache.get(key);
      if (!resolved) {
        const props = resolveCharProps(styles, istd, [
          covering?.grpprl ?? NO_PROPS,
          this.pieceProps[pieceIndex] as Uint8Array,
        ]);
        resolved = marksOf(props, fonts);
        this.marksCache.set(key, resolved);
      }
      const last = segments[segments.length - 1];
      if (last && last.to === cp && last.dropped === resolved.dropped && sameMarks(last.marks, resolved.marks)) {
        last.to = end;
      } else {
        segments.push({
          from: cp,
          to: end,
          ...(resolved.marks ? { marks: resolved.marks } : {}),
          dropped: resolved.dropped,
        });
      }
      cp = end;
    }
    return segments;
  }
}

function sameMarks(a: Marks | undefined, b: Marks | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const keys = Object.keys(a) as (keyof Marks)[];
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

/** A piece of paragraph content waiting for the paragraph's mark, which names its style. */
interface Pending {
  kind: 'text' | 'lineBreak' | 'tab';
  /** The CP of the first character. */
  cp: number;
  text: string;
  href: string | undefined;
}

/** Gathers the inlines of one paragraph, merging neighbouring text with equal marks. */
class InlineSink {
  readonly inlines: Inline[] = [];
  private link: Link | undefined;

  private add(inline: Inline, href: string | undefined): void {
    if (href === undefined) {
      this.link = undefined;
      this.inlines.push(inline);
      return;
    }
    if (this.link?.href !== href) {
      this.link = { kind: 'link', href, inlines: [] };
      this.inlines.push(this.link);
    }
    this.link.inlines.push(inline);
  }

  text(chars: string, href: string | undefined, marks: Marks | undefined): void {
    const target = href === undefined ? this.inlines : this.link?.href === href ? this.link.inlines : undefined;
    const last = target?.[target.length - 1];
    if (last?.kind === 'text' && sameMarks(last.marks, marks)) last.text += chars;
    else this.add({ kind: 'text', text: chars, ...(marks ? { marks: { ...marks } } : {}) }, href);
  }

  other(inline: Inline, href: string | undefined): void {
    this.add(inline, href);
  }
}

/** The row definition of a row-end paragraph, as a spread: nothing when its `sprmTDefTable` is absent or unreadable. */
function defOf(operand: Uint8Array | undefined): { def?: RowDef } {
  const def = readRowDef(operand);
  return def ? { def } : {};
}

/**
 * Builds paragraphs and page breaks from a run of document text whose first character is at CP `cpBase`. With `format`,
 * text carries its marks, paragraphs their properties, and hidden and deleted text is left out.
 */
export function buildBlocks(text: string, format?: DocFormat, cpBase = 0): Block[] {
  const formatter = format && new Formatter(format);
  const numbering = format?.lists && new ListNumbering(format.lists);
  const items: FlatItem[] = [];
  let pending: Pending[] = [];

  /** `terminator` is the character that ends the paragraph: `0x07` ends a cell. */
  function endParagraph(markCp: number, terminator: string): void {
    const paragraphFormat = formatter?.paragraphAt(markCp);
    const table = paragraphFormat?.table;
    const depth = table?.depth ?? 0;
    if (table?.rowEnd) {
      // The row end holds no content of its own; its properties give the row.
      pending = [];
      items.push({ depth, cellEnd: false, row: { header: table.header, ...defOf(table.def) } });
      return;
    }
    const sink = new InlineSink();
    for (const item of pending) {
      const length = item.kind === 'text' ? item.text.length : 1;
      const segments = formatter
        ? formatter.segments(item.cp, item.cp + length, paragraphFormat?.istd ?? 0)
        : [{ from: item.cp, to: item.cp + length, dropped: false } as Segment];
      for (const segment of segments) {
        if (segment.dropped) continue;
        if (item.kind === 'text') {
          sink.text(item.text.slice(segment.from - item.cp, segment.to - item.cp), item.href, segment.marks);
        } else {
          sink.other({ kind: item.kind }, item.href);
        }
      }
    }
    // A paragraph whose text and mark are both hidden or deleted is gone, not an empty line.
    const markDropped = formatter?.segments(markCp, markCp + 1, paragraphFormat?.istd ?? 0)[0]?.dropped === true;
    const cellEnd = depth > 0 && (terminator === '\x07' || table?.innerCell === true);
    // A cell's last paragraph stays, empty, so the cell does; elsewhere a hidden paragraph is gone.
    const gone = pending.length > 0 && sink.inlines.length === 0 && markDropped && !cellEnd;
    pending = [];
    if (gone) return;
    if (paragraphFormat?.pageBreakBefore && items.length > 0)
      items.push({ block: { kind: 'pageBreak' }, depth, cellEnd: false });
    const list = paragraphFormat?.list && numbering?.next(paragraphFormat.list.ilfo, paragraphFormat.list.ilvl);
    items.push({
      block: { kind: 'paragraph', ...paragraphFormat?.fields, ...(list ? { list } : {}), inlines: sink.inlines },
      depth,
      cellEnd,
    });
  }

  for (const chunk of resolveFieldChunks(text)) {
    let run = '';
    let runCp = 0;
    let offset = 0;
    const flush = () => {
      if (run) pending.push({ kind: 'text', cp: runCp, text: run, href: chunk.href });
      run = '';
    };
    const append = (chars: string, at: number) => {
      if (!run) runCp = cpBase + at;
      run += chars;
    };
    for (const char of chunk.text) {
      const cp = cpBase + chunk.start + offset;
      offset += char.length;
      switch (char) {
        case '\r':
          flush();
          endParagraph(cp, char);
          break;
        case '\x07':
          // Inside a table this ends a cell or a row; elsewhere an empty one is stray and gives no paragraph.
          flush();
          if (pending.length > 0 || (formatter?.paragraphAt(cp).table.depth ?? 0) > 0) endParagraph(cp, char);
          break;
        case '\x0b':
          flush();
          pending.push({ kind: 'lineBreak', cp, text: '', href: chunk.href });
          break;
        case '\t':
          flush();
          pending.push({ kind: 'tab', cp, text: '', href: chunk.href });
          break;
        case '\x0c':
          flush();
          if (pending.length > 0) endParagraph(cp, char);
          items.push({
            block: { kind: 'pageBreak' },
            depth: formatter?.paragraphAt(cp).table.depth ?? 0,
            cellEnd: false,
          });
          break;
        case '\x1e':
          append(NON_BREAKING_HYPHEN, chunk.start + offset - 1);
          break;
        default:
          // Other control characters (pictures, drawings, comment marks, optional hyphens) are dropped for now; the
          // text around them is split so each run stays at consecutive CPs.
          if (char >= ' ') append(char, chunk.start + offset - char.length);
          else flush();
      }
    }
    flush();
  }
  const last = pending[pending.length - 1];
  if (last) endParagraph(last.cp + last.text.length - (last.text ? 1 : 0), '');
  return buildTables(items);
}

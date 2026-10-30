import type {
  Block,
  ImageInline,
  Inline,
  Marks,
  Note,
  Paragraph,
  Table,
  TableCell,
  TableRow,
} from '../../model/document-model';
import { headingLevelFor } from '../shared/heading-rule';
import { parseLength } from '../shared/units';
import { ListNumbering, type ListHandle, type ListMarker, type ListStyle } from './odt-lists';
import type { ColumnStyle, OdtStyles, TextProps } from './odt-styles';
import { attr, childElements, descendants, firstChild, intAttr, NS, round } from './odt-xml';

/** What the body walk needs besides the body itself. */
export interface BodyContext {
  styles: OdtStyles;
  listStyles: ReadonlyMap<string, ListStyle>;
  /** The bytes of the pictures inside the zip, by the path used in `xlink:href`. */
  images: ReadonlyMap<string, Uint8Array>;
  /** Page width minus margins, the basis of relative table widths. */
  textWidthMm: number;
}

export interface Body {
  blocks: Block[];
  notes: Note[];
}

// Stops a malformed `table:number-rows-repeated` (or columns, or `text:c`) from blowing up.
const MAX_REPEAT = 1000;
const DEFAULT_IMAGE_PX = 96;
const BASE_FONT_PT = 11;

// Elements whose content is not part of the final text.
const SKIPPED_TEXT_ELEMENTS = new Set([
  'tracked-changes',
  'table-of-content-source',
  'index-title-template',
  'alphabetical-index-source',
  'bibliography-source',
  'illustration-index-source',
  'object-index-source',
  'table-index-source',
  'user-index-source',
]);

/** The path of a picture inside the zip, or undefined for an external or otherwise unusable href. */
export function internalImagePath(href: string | undefined): string | undefined {
  const trimmed = href?.trim();
  if (!trimmed || /^[a-z][a-z0-9+.-]*:/i.test(trimmed) || /^[/\\#]/.test(trimmed)) return undefined;
  const path = trimmed.replace(/^(\.\/)+/, '');
  return path.split('/').includes('..') ? undefined : path;
}

/** The zip paths of every picture the body refers to. */
export function imagePaths(body: Element): string[] {
  const paths = new Set<string>();
  for (const image of descendants(body, NS.draw, 'image')) {
    const path = internalImagePath(attr(image, NS.xlink, 'href'));
    if (path !== undefined) paths.add(path);
  }
  return [...paths];
}

function sniffMime(data: Uint8Array): NonNullable<ImageInline['src']>['mime'] | undefined {
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return 'image/png';
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x38) return 'image/gif';
  if (data[0] === 0x42 && data[1] === 0x4d) return 'image/bmp';
  return undefined;
}

function toMarks(props: TextProps): Marks | undefined {
  const marks: Marks = {};
  if (props.bold) marks.bold = true;
  if (props.italic) marks.italic = true;
  if (props.underline) marks.underline = true;
  if (props.strike) marks.strike = true;
  if (props.position === 'super') marks.superscript = true;
  if (props.position === 'sub') marks.subscript = true;
  if (props.color) marks.color = props.color;
  if (props.background && props.background !== 'transparent') marks.highlight = props.background;
  if (props.fontFamily) marks.fontFamily = props.fontFamily;
  if (props.fontSizePt !== undefined && Math.abs(props.fontSizePt - BASE_FONT_PT) > 0.01) {
    marks.fontSizePt = props.fontSizePt;
  }
  return Object.keys(marks).length > 0 ? marks : undefined;
}

function sameMarks(a: Marks | undefined, b: Marks | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function nonZero(value: number | undefined): number | undefined {
  return value === undefined || Math.abs(value) < 0.001 ? undefined : value;
}

/** Where a paragraph sits in a list: set while walking a `text:list-item` or `text:list-header`. */
interface ListPosition {
  handle: ListHandle;
  level: number;
  header: boolean;
  startValue: number | undefined;
  /** True once the item's first paragraph has taken the marker. */
  marked: boolean;
}

/** The text of a paragraph being built; `afterSpace` drives ODF's collapsing of white space. */
interface InlineState {
  afterSpace: boolean;
}

/** Walks `office:text` into blocks and notes. */
export function walkBody(root: Element, ctx: BodyContext): Body {
  return new BodyWalker(ctx).walk(root);
}

class BodyWalker {
  private readonly notes: Note[] = [];
  private readonly numbering: ListNumbering;

  constructor(private readonly ctx: BodyContext) {
    this.numbering = new ListNumbering(ctx.listStyles);
  }

  walk(root: Element): Body {
    const blocks: Block[] = [];
    this.blocks(root, blocks, undefined);
    return { blocks, notes: this.notes };
  }

  private blocks(parent: Element, out: Block[], position: ListPosition | undefined): void {
    for (const child of childElements(parent)) {
      if (child.namespaceURI === NS.table && child.localName === 'table') {
        out.push(this.table(child));
      } else if (child.namespaceURI === NS.text) {
        if (SKIPPED_TEXT_ELEMENTS.has(child.localName)) continue;
        if (child.localName === 'p' || child.localName === 'h') this.paragraph(child, out, position);
        else if (child.localName === 'list') this.list(child, out, position);
        // Sections, tables of contents and their bodies hold blocks in place.
        else this.blocks(child, out, position);
      }
    }
  }

  private list(element: Element, out: Block[], parent: ListPosition | undefined): void {
    let handle: ListHandle;
    let level: number;
    if (parent) {
      handle = parent.handle;
      level = parent.level + 1;
    } else {
      const styleName = attr(element, NS.text, 'style-name') ?? this.listStyleOfFirstParagraph(element);
      handle = this.numbering.begin({
        styleName,
        xmlId: attr(element, NS.xml, 'id'),
        continueList: attr(element, NS.text, 'continue-list'),
        continueNumbering: attr(element, NS.text, 'continue-numbering') === 'true',
      });
      level = 0;
    }
    for (const item of childElements(element)) {
      if (item.namespaceURI !== NS.text) continue;
      if (item.localName !== 'list-item' && item.localName !== 'list-header') continue;
      const startValue = attr(item, NS.text, 'start-value');
      const position: ListPosition = {
        handle,
        level,
        header: item.localName === 'list-header',
        startValue: startValue !== undefined && /^\d+$/.test(startValue) ? Number(startValue) : undefined,
        marked: false,
      };
      this.blocks(item, out, position);
    }
  }

  /** The list style a paragraph style names, for a list that has no style of its own. */
  private listStyleOfFirstParagraph(list: Element): string | undefined {
    for (const element of list.getElementsByTagNameNS(NS.text, '*')) {
      if (element.localName !== 'p' && element.localName !== 'h') continue;
      return this.ctx.styles.paragraph(attr(element, NS.text, 'style-name')).listStyleName;
    }
    return undefined;
  }

  private paragraph(element: Element, out: Block[], position: ListPosition | undefined): void {
    const { styles } = this.ctx;
    const resolved = styles.paragraph(attr(element, NS.text, 'style-name'));
    // A break at the very start of the document, a cell or a note has nothing to separate.
    if (resolved.para.breakBefore && out.length > 0) out.push({ kind: 'pageBreak' });

    const paragraph: Paragraph = { kind: 'paragraph', inlines: [] };
    if (element.localName === 'h') {
      paragraph.headingLevel = Math.min(intAttr(element, NS.text, 'outline-level', 1), 6) as NonNullable<
        Paragraph['headingLevel']
      >;
    } else {
      const level = headingLevelFor({ outlineLevel: resolved.outlineLevel, styleNames: resolved.styleNames });
      if (level !== undefined) paragraph.headingLevel = level;
    }

    const { para } = resolved;
    if (para.align && para.align !== 'left') paragraph.align = para.align;
    let marginLeft = para.marginLeftMm;
    let firstLine = para.textIndentMm;
    if (position) {
      const marker = this.marker(position);
      marginLeft ??= marker.marginLeftMm;
      firstLine ??= marker.textIndentMm;
      paragraph.list = { level: marker.level, marker: marker.marker, ordered: marker.ordered };
    }
    const left = nonZero(marginLeft);
    if (left !== undefined) paragraph.indentLeftMm = left;
    const right = nonZero(para.marginRightMm);
    if (right !== undefined) paragraph.indentRightMm = right;
    const first = nonZero(firstLine);
    if (first !== undefined) paragraph.firstLineMm = first;
    const before = nonZero(para.marginTopPt);
    if (before !== undefined) paragraph.spaceBeforePt = before;
    const after = nonZero(para.marginBottomPt);
    if (after !== undefined) paragraph.spaceAfterPt = after;
    if (para.lineHeight !== undefined && Math.abs(para.lineHeight - 1) > 0.001) paragraph.lineHeight = para.lineHeight;

    this.inlines(element, resolved.text, paragraph.inlines, { afterSpace: true });
    out.push(paragraph);
  }

  private marker(position: ListPosition): ListMarker {
    const { handle, level } = position;
    if (position.header || position.marked) return this.numbering.unmarked(handle, level);
    position.marked = true;
    return this.numbering.item(handle, level, position.startValue);
  }

  private inlines(parent: Element, text: TextProps, out: Inline[], state: InlineState): void {
    for (let node = parent.firstChild; node; node = node.nextSibling) {
      if (node.nodeType === 3 || node.nodeType === 4) {
        this.text((node as CharacterData).data, text, out, state);
      } else if (node.nodeType === 1) {
        this.inlineElement(node as Element, text, out, state);
      }
    }
  }

  private text(data: string, props: TextProps, out: Inline[], state: InlineState): void {
    // ODF collapses runs of white space into one space and drops it at the start of a paragraph.
    let collapsed = data.replace(/[ \t\r\n]+/g, ' ');
    if (state.afterSpace && collapsed.startsWith(' ')) collapsed = collapsed.slice(1);
    if (collapsed === '') return;
    state.afterSpace = collapsed.endsWith(' ');
    this.append(out, collapsed, props);
  }

  private append(out: Inline[], text: string, props: TextProps): void {
    const marks = toMarks(props);
    const last = out[out.length - 1];
    if (last?.kind === 'text' && sameMarks(last.marks, marks)) {
      last.text += text;
    } else {
      out.push(marks ? { kind: 'text', text, marks } : { kind: 'text', text });
    }
  }

  private inlineElement(element: Element, text: TextProps, out: Inline[], state: InlineState): void {
    if (element.namespaceURI === NS.draw) {
      if (element.localName === 'frame') this.frame(element, out);
      return;
    }
    if (element.namespaceURI !== NS.text || SKIPPED_TEXT_ELEMENTS.has(element.localName)) return;

    switch (element.localName) {
      case 'span':
        this.inlines(element, this.ctx.styles.applyTextStyle(text, attr(element, NS.text, 'style-name')), out, state);
        return;
      case 's': {
        const count = Math.min(intAttr(element, NS.text, 'c', 1), MAX_REPEAT);
        this.append(out, ' '.repeat(count), text);
        state.afterSpace = false;
        return;
      }
      case 'tab':
        out.push({ kind: 'tab' });
        state.afterSpace = true;
        return;
      case 'line-break':
        out.push({ kind: 'lineBreak' });
        state.afterSpace = true;
        return;
      case 'soft-page-break':
        return;
      case 'a': {
        const href = attr(element, NS.xlink, 'href');
        if (!href) {
          this.inlines(element, text, out, state);
          return;
        }
        const inner: Inline[] = [];
        this.inlines(element, text, inner, state);
        out.push({ kind: 'link', href, inlines: inner });
        return;
      }
      case 'bookmark':
      case 'bookmark-start': {
        const name = attr(element, NS.text, 'name');
        if (name) out.push({ kind: 'anchor', id: name });
        return;
      }
      case 'note':
        this.note(element, out);
        return;
      default:
        // Fields (`text:sequence`, `text:date`, `text:page-number`…) and other inline wrappers show their text.
        this.inlines(element, text, out, state);
    }
  }

  private note(element: Element, out: Inline[]): void {
    const citation = firstChild(element, NS.text, 'note-citation')?.textContent?.trim();
    const id = String(this.notes.length + 1);
    const label = citation || id;
    const note: Note = { id, label, blocks: [] };
    // Added first so notes stay in reference order even when a note holds another.
    this.notes.push(note);
    out.push({ kind: 'noteRef', noteId: id, label });
    const body = firstChild(element, NS.text, 'note-body');
    if (body) this.blocks(body, note.blocks, undefined);
  }

  private frame(element: Element, out: Inline[]): void {
    if (firstChild(element, NS.draw, 'text-box')) return;
    const image = firstChild(element, NS.draw, 'image');
    if (!image) return;

    const width = parseLength(attr(element, NS.svg, 'width'));
    const height = parseLength(attr(element, NS.svg, 'height'));
    const result: ImageInline = {
      kind: 'image',
      widthPx: width ? round(width.px, 2) : DEFAULT_IMAGE_PX,
      heightPx: height ? round(height.px, 2) : DEFAULT_IMAGE_PX,
    };
    const alt = (
      firstChild(element, NS.svg, 'desc')?.textContent ??
      firstChild(element, NS.svg, 'title')?.textContent ??
      ''
    ).trim();
    if (alt) result.alt = alt;

    const path = internalImagePath(attr(image, NS.xlink, 'href'));
    const data = path === undefined ? undefined : this.ctx.images.get(path);
    const mime = data && sniffMime(data);
    if (data && mime) result.src = { mime, data };
    out.push(result);
  }

  private table(element: Element): Table {
    const { styles } = this.ctx;
    const columns: ColumnStyle[] = [];
    const rows: TableRow[] = [];

    const collect = (parent: Element, header: boolean): void => {
      for (const child of childElements(parent)) {
        if (child.namespaceURI !== NS.table) continue;
        switch (child.localName) {
          case 'table-column': {
            const style = styles.column(attr(child, NS.table, 'style-name'));
            const repeat = Math.min(intAttr(child, NS.table, 'number-columns-repeated', 1), MAX_REPEAT);
            for (let i = 0; i < repeat; i++) columns.push(style);
            break;
          }
          case 'table-row': {
            const row = this.row(child, header);
            const repeat = Math.min(intAttr(child, NS.table, 'number-rows-repeated', 1), MAX_REPEAT);
            for (let i = 0; i < repeat; i++) rows.push(row);
            break;
          }
          case 'table-header-rows':
            collect(child, true);
            break;
          case 'table-columns':
          case 'table-header-columns':
          case 'table-column-group':
          case 'table-rows':
          case 'table-row-group':
            collect(child, header);
            break;
        }
      }
    };
    collect(element, false);

    const table: Table = { kind: 'table', rows };
    const relWidth = styles.tableRelWidthPercent(attr(element, NS.table, 'style-name')) ?? 100;
    const widths = this.columnWidths(columns, (this.ctx.textWidthMm * relWidth) / 100);
    if (widths) table.columnWidthsMm = widths;
    return table;
  }

  /** Absolute widths as given; relative ones share what the absolute ones leave of the table width. */
  private columnWidths(columns: ColumnStyle[], tableWidthMm: number): number[] | undefined {
    if (
      columns.length === 0 ||
      columns.some((column) => column.widthMm === undefined && column.relative === undefined)
    ) {
      return undefined;
    }
    const absolute = columns.reduce((sum, column) => sum + (column.widthMm ?? 0), 0);
    const relativeTotal = columns.reduce(
      (sum, column) => sum + (column.widthMm === undefined ? (column.relative ?? 0) : 0),
      0,
    );
    const remaining = Math.max(tableWidthMm - absolute, 0);
    return columns.map(
      (column) =>
        column.widthMm ?? (relativeTotal > 0 ? round((remaining * (column.relative ?? 0)) / relativeTotal, 3) : 0),
    );
  }

  private row(element: Element, header: boolean): TableRow {
    const cells: TableCell[] = [];
    for (const child of childElements(element)) {
      // A covered cell is the place a merged cell extends over.
      if (child.namespaceURI !== NS.table || child.localName !== 'table-cell') continue;
      const cell = this.cell(child);
      const repeat = Math.min(intAttr(child, NS.table, 'number-columns-repeated', 1), MAX_REPEAT);
      for (let i = 0; i < repeat; i++) cells.push(cell);
    }
    return header ? { cells, header: true } : { cells };
  }

  private cell(element: Element): TableCell {
    const blocks: Block[] = [];
    this.blocks(element, blocks, undefined);
    const cell: TableCell = { blocks };
    const colSpan = intAttr(element, NS.table, 'number-columns-spanned', 1);
    if (colSpan > 1) cell.colSpan = colSpan;
    const rowSpan = intAttr(element, NS.table, 'number-rows-spanned', 1);
    if (rowSpan > 1) cell.rowSpan = rowSpan;
    const background = this.ctx.styles.cellBackground(attr(element, NS.table, 'style-name'));
    if (background) cell.background = background;
    return cell;
  }
}

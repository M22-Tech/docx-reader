import type {
  Anchor,
  Block,
  DocumentModel,
  ImageInline,
  Inline,
  Link,
  Marks,
  NoteRef,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
} from './document-model';

export function run(text: string, marks?: Marks): TextRun {
  return marks ? { kind: 'text', text, marks } : { kind: 'text', text };
}

export function para(content: string | Inline[], rest: Partial<Paragraph> = {}): Paragraph {
  const inlines = typeof content === 'string' ? [run(content)] : content;
  return { kind: 'paragraph', inlines, ...rest };
}

export function link(href: string, ...inlines: Inline[]): Link {
  return { kind: 'link', href, inlines };
}

export function anchor(id: string): Anchor {
  return { kind: 'anchor', id };
}

export function noteRef(noteId: string, label: string): NoteRef {
  return { kind: 'noteRef', noteId, label };
}

export function image(widthPx: number, heightPx: number, rest: Partial<ImageInline> = {}): ImageInline {
  return { kind: 'image', widthPx, heightPx, ...rest };
}

export const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** The base64 of `PNG_BYTES`. */
export const PNG_BASE64 = 'iVBORw0KGgo=';

export function pngImage(widthPx: number, heightPx: number, alt?: string): ImageInline {
  return image(widthPx, heightPx, {
    src: { mime: 'image/png', data: PNG_BYTES },
    ...(alt === undefined ? {} : { alt }),
  });
}

export function cell(blocks: Block[] | string, rest: Partial<TableCell> = {}): TableCell {
  return { blocks: typeof blocks === 'string' ? [para(blocks)] : blocks, ...rest };
}

export function row(cells: (TableCell | string)[], header = false): TableRow {
  const mapped = cells.map((c) => (typeof c === 'string' ? cell(c) : c));
  return header ? { cells: mapped, header } : { cells: mapped };
}

export function table(rows: TableRow[], columnWidthsMm?: number[]): Table {
  return columnWidthsMm ? { kind: 'table', rows, columnWidthsMm } : { kind: 'table', rows };
}

export function model(blocks: Block[], rest: Partial<DocumentModel> = {}): DocumentModel {
  return { blocks, notes: [], ...rest };
}

/** Parses rendered HTML into a div to query. */
export function toDom(html: string): HTMLDivElement {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

/** A model using every block and inline kind, with text that is easy to find. */
export function fullModel(): DocumentModel {
  return {
    page: { widthMm: 210, heightMm: 297, marginTopMm: 20, marginRightMm: 20, marginBottomMm: 20, marginLeftMm: 20 },
    blocks: [
      para('Title text', { headingLevel: 1 }),
      para(
        [
          run('plain '),
          run('bold', { bold: true, color: '#ff0000' }),
          { kind: 'lineBreak' },
          { kind: 'tab' },
          run('after tab'),
          anchor('top'),
          link('https://example.com/a', run('external link')),
          link('#top', run('internal link')),
          run('note'),
          noteRef('n1', '1'),
          pngImage(40, 30, 'a picture'),
          image(50, 20),
        ],
        { align: 'center' },
      ),
      para('List item', { list: { level: 1, marker: '2.', ordered: true } }),
      { kind: 'pageBreak' },
      table([row(['Head A', 'Head B'], true), row([cell('Cell A', { colSpan: 2 })])], [60, 60]),
      para(''),
    ],
    notes: [{ id: 'n1', label: '1', blocks: [para('Footnote text')] }],
  };
}

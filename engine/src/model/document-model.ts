/** A parsed document: what the doc, rtf and odt parsers produce and the model renderers read. */
export interface DocumentModel {
  /** Absent when the file has none. */
  page?: PageSetup;
  blocks: Block[];
  /** Footnotes and endnotes, in reference order. */
  notes: Note[];
  title?: string;
}

/** Page size and margins in millimetres. */
export interface PageSetup {
  widthMm: number;
  heightMm: number;
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
}

/** A top-level or in-cell block. */
export type Block = Paragraph | Table | PageBreak;

/** A paragraph with its resolved formatting. */
export interface Paragraph {
  kind: 'paragraph';
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  align?: 'left' | 'center' | 'right' | 'justify';
  indentLeftMm?: number;
  indentRightMm?: number;
  /** Negative means hanging. */
  firstLineMm?: number;
  spaceBeforePt?: number;
  spaceAfterPt?: number;
  /** A multiple of the font size, 1.15 etc. */
  lineHeight?: number;
  /** `marker` is the final text, "1.", "a)", "•". */
  list?: { level: number; marker: string; ordered: boolean };
  inlines: Inline[];
}

/** A table of rows and cells. */
export interface Table {
  kind: 'table';
  rows: TableRow[];
  columnWidthsMm?: number[];
}

/** One table row. */
export interface TableRow {
  cells: TableCell[];
  header?: boolean;
}

/** One table cell; merged-away cells are omitted. */
export interface TableCell {
  blocks: Block[];
  colSpan?: number;
  rowSpan?: number;
  widthMm?: number;
  background?: string;
}

/** A hard page break. */
export interface PageBreak {
  kind: 'pageBreak';
}

/** Content inside a paragraph. */
export type Inline = TextRun | LineBreak | Tab | ImageInline | Link | NoteRef | Anchor;

/** Text with the marks that differ from the defaults. */
export interface TextRun {
  kind: 'text';
  text: string;
  marks?: Marks;
}

/** Character formatting; colours are `#rrggbb`. */
export interface Marks {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  superscript?: boolean;
  subscript?: boolean;
  color?: string;
  highlight?: string;
  fontFamily?: string;
  fontSizePt?: number;
}

/** A line break inside a paragraph. */
export interface LineBreak {
  kind: 'lineBreak';
}

/** A tab character. */
export interface Tab {
  kind: 'tab';
}

/** An inline image; `src` absent means a placeholder box. */
export interface ImageInline {
  kind: 'image';
  widthPx: number;
  heightPx: number;
  alt?: string;
  src?: { mime: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/bmp'; data: Uint8Array };
}

/** A hyperlink; `href` may be "#bookmark". */
export interface Link {
  kind: 'link';
  href: string;
  inlines: Inline[];
}

/** A reference to a footnote or endnote. */
export interface NoteRef {
  kind: 'noteRef';
  noteId: string;
  label: string;
}

/** A bookmark target for "#id" links. */
export interface Anchor {
  kind: 'anchor';
  id: string;
}

/** A footnote or endnote. */
export interface Note {
  id: string;
  label: string;
  blocks: Block[];
}

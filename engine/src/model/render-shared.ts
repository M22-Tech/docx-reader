import type { Mode } from '../formats/format-adapter';
import { bytesToBase64, escapeAttr, escapeHtml, placeholderHtml, safeColor, safeFontFamily, safeNumber } from './html';
import type {
  Block,
  DocumentModel,
  ImageInline,
  Inline,
  Marks,
  Note,
  Paragraph,
  Table,
  TableRow,
} from './document-model';

interface Context {
  mode: Mode;
  /** Notes whose first reference has been written; only that one gets the `id`. */
  referenced: Set<string>;
}

const MARK_TAGS: [keyof Marks, string][] = [
  ['subscript', 'sub'],
  ['superscript', 'sup'],
  ['bold', 'strong'],
  ['italic', 'em'],
  ['underline', 'u'],
  ['strike', 's'],
];

/** Renders the blocks and notes of a model; the callers add the wrapper. */
export function renderBody(model: DocumentModel, mode: Mode): string {
  const ctx: Context = { mode, referenced: new Set() };
  const blocks = model.blocks.map((block, index) => renderBlock(block, ctx, index)).join('');
  return blocks + renderNotes(model.notes, ctx);
}

/** Style attribute from declarations; empty when none are left. */
export function styleAttr(declarations: (string | undefined)[]): string {
  const kept = declarations.filter((d): d is string => d !== undefined);
  return kept.length > 0 ? ` style="${escapeAttr(kept.join(';'))}"` : '';
}

function renderBlocks(blocks: Block[], ctx: Context): string {
  return blocks.map((block) => renderBlock(block, ctx)).join('');
}

/** `index` is given for top-level blocks only. */
function renderBlock(block: Block, ctx: Context, index?: number): string {
  const dataBlock = index === undefined ? '' : ` data-block="${index}"`;
  switch (block.kind) {
    case 'paragraph':
      return renderParagraph(block, ctx, dataBlock);
    case 'table':
      return renderTable(block, ctx, dataBlock);
    case 'pageBreak':
      return `<hr class="dr-page-break"${dataBlock}>`;
  }
}

function lengthDecl(property: string, value: number | undefined, unit: string): string | undefined {
  const n = safeNumber(value);
  return n === undefined ? undefined : `${property}:${n}${unit}`;
}

function paragraphStyle(p: Paragraph): string {
  const lineHeight = safeNumber(p.lineHeight);
  return styleAttr([
    p.align ? `text-align:${p.align}` : undefined,
    lengthDecl('margin-left', p.indentLeftMm, 'mm'),
    lengthDecl('margin-right', p.indentRightMm, 'mm'),
    lengthDecl('text-indent', p.firstLineMm, 'mm'),
    lengthDecl('margin-top', p.spaceBeforePt, 'pt'),
    lengthDecl('margin-bottom', p.spaceAfterPt, 'pt'),
    lineHeight !== undefined && lineHeight > 0 ? `line-height:${lineHeight}` : undefined,
  ]);
}

function isVisible(inline: Inline): boolean {
  if (inline.kind === 'text') return inline.text.length > 0;
  if (inline.kind === 'anchor') return false;
  if (inline.kind === 'link') return inline.inlines.some(isVisible);
  return true;
}

function renderParagraph(p: Paragraph, ctx: Context, dataBlock: string): string {
  const layout = ctx.mode === 'layout';
  const empty = !p.list && !p.inlines.some(isVisible);
  const inner = renderInlines(p.inlines, ctx);
  // Reading drops empty paragraphs, but keeps their anchors so links to them still work.
  if (!layout && empty && inner === '') return '';

  const tag = p.headingLevel ? `h${p.headingLevel}` : 'p';
  const classes: string[] = [];
  if (layout && p.headingLevel) classes.push('dr-h');
  if (p.list) classes.push('dr-li');
  if (!layout && (p.align === 'center' || p.align === 'right')) classes.push(`dr-${p.align}`);

  const marker = p.list ? `<span class="dr-marker">${escapeHtml(p.list.marker)}</span>` : '';
  const level = !layout && p.list ? ` data-level="${Math.max(0, Math.trunc(safeNumber(p.list.level) ?? 0))}"` : '';
  const classAttr = classes.length > 0 ? ` class="${classes.join(' ')}"` : '';
  const style = layout ? paragraphStyle(p) : '';
  const filler = layout && empty ? '<br>' : '';
  return `<${tag}${classAttr}${style}${level}${dataBlock}>${marker}${inner}${filler}</${tag}>`;
}

function marksKey(marks: Marks | undefined): string {
  if (!marks) return '';
  return [
    ...MARK_TAGS.map(([key]) => (marks[key] ? '1' : '0')),
    marks.color,
    marks.highlight,
    marks.fontFamily,
    marks.fontSizePt,
  ].join('|');
}

function renderInlines(inlines: Inline[], ctx: Context): string {
  let out = '';
  let i = 0;
  while (i < inlines.length) {
    const inline = inlines[i]!;
    i++;
    if (inline.kind !== 'text') {
      out += renderInline(inline, ctx);
      continue;
    }
    // Adjacent runs with equal marks become one element.
    const key = marksKey(inline.marks);
    let text = inline.text;
    for (let next = inlines[i]; next?.kind === 'text' && marksKey(next.marks) === key; next = inlines[i]) {
      text += next.text;
      i++;
    }
    out += renderRun(text, inline.marks, ctx);
  }
  return out;
}

function renderRun(text: string, marks: Marks | undefined, ctx: Context): string {
  if (text === '') return '';
  let html = escapeHtml(text);
  if (!marks) return html;
  for (const [key, tag] of MARK_TAGS) {
    if (marks[key]) html = `<${tag}>${html}</${tag}>`;
  }
  if (ctx.mode !== 'layout') return html;

  const color = safeColor(marks.color);
  const highlight = safeColor(marks.highlight);
  const family = safeFontFamily(marks.fontFamily);
  const size = safeNumber(marks.fontSizePt);
  const style = styleAttr([
    color ? `color:${color}` : undefined,
    highlight ? `background-color:${highlight}` : undefined,
    family ? `font-family:'${family}'` : undefined,
    size !== undefined && size > 0 ? `font-size:${size}pt` : undefined,
  ]);
  return style ? `<span${style}>${html}</span>` : html;
}

function renderInline(inline: Exclude<Inline, { kind: 'text' }>, ctx: Context): string {
  switch (inline.kind) {
    case 'lineBreak':
      return '<br>';
    case 'tab':
      return ctx.mode === 'layout' ? '<span class="dr-tab"></span>' : ' ';
    case 'image':
      return renderImage(inline, ctx);
    case 'link': {
      const href = inline.href.startsWith('#') ? `#dr-bm-${inline.href.slice(1)}` : inline.href;
      return `<a href="${escapeAttr(href)}">${renderInlines(inline.inlines, ctx)}</a>`;
    }
    case 'noteRef': {
      const first = !ctx.referenced.has(inline.noteId);
      ctx.referenced.add(inline.noteId);
      const id = escapeAttr(inline.noteId);
      const idAttr = first ? ` id="dr-noteref-${id}"` : '';
      return `<sup class="dr-noteref"><a${idAttr} href="#dr-note-${id}">${escapeHtml(inline.label)}</a></sup>`;
    }
    case 'anchor':
      return `<a id="dr-bm-${escapeAttr(inline.id)}" class="dr-anchor"></a>`;
  }
}

function renderImage(image: ImageInline, ctx: Context): string {
  const width = safeNumber(image.widthPx);
  const height = safeNumber(image.heightPx);
  if (!image.src) return placeholderHtml(width, height, ctx.mode === 'layout');
  const size = (width !== undefined ? ` width="${width}"` : '') + (height !== undefined ? ` height="${height}"` : '');
  const src = `data:${image.src.mime};base64,${bytesToBase64(image.src.data)}`;
  return `<img src="${src}"${size} alt="${escapeAttr(image.alt ?? '')}">`;
}

function renderNotes(notes: Note[], ctx: Context): string {
  if (notes.length === 0) return '';
  const items = notes.map((note) => {
    const id = escapeAttr(note.id);
    const label = `<a class="dr-note-label" href="#dr-noteref-${id}">${escapeHtml(note.label)}</a>`;
    return `<div class="dr-note" id="dr-note-${id}">${label}${renderBlocks(note.blocks, ctx)}</div>`;
  });
  return `<section class="dr-notes">${items.join('')}</section>`;
}

function renderTable(table: Table, ctx: Context, dataBlock: string): string {
  const layout = ctx.mode === 'layout';
  const widths = layout ? (table.columnWidthsMm ?? []) : [];
  const cols = widths.map((w) => `<col${styleAttr([lengthDecl('width', w, 'mm')])}>`).join('');
  const colgroup = cols ? `<colgroup>${cols}</colgroup>` : '';

  // Only the header rows at the top go in <thead>.
  let headerCount = 0;
  while (table.rows[headerCount]?.header) headerCount++;
  const head = table.rows.slice(0, headerCount).map((row) => renderRow(row, ctx));
  const body = table.rows.slice(headerCount).map((row) => renderRow(row, ctx));
  const thead = head.length > 0 ? `<thead>${head.join('')}</thead>` : '';
  return `<div class="dr-table-wrap"${dataBlock}><table>${colgroup}${thead}<tbody>${body.join('')}</tbody></table></div>`;
}

function renderRow(row: TableRow, ctx: Context): string {
  const layout = ctx.mode === 'layout';
  const tag = row.header ? 'th' : 'td';
  const cells = row.cells.map((cell) => {
    const colSpan = (cell.colSpan ?? 1) > 1 ? ` colspan="${Math.trunc(cell.colSpan!)}"` : '';
    const rowSpan = (cell.rowSpan ?? 1) > 1 ? ` rowspan="${Math.trunc(cell.rowSpan!)}"` : '';
    const background = safeColor(cell.background);
    const style = layout
      ? styleAttr([lengthDecl('width', cell.widthMm, 'mm'), background ? `background-color:${background}` : undefined])
      : '';
    return `<${tag}${colSpan}${rowSpan}${style}>${renderBlocks(cell.blocks, ctx)}</${tag}>`;
  });
  return `<tr>${cells.join('')}</tr>`;
}

import type { Block, Table, TableCell, TableRow } from '../../model/document-model';
import { columnGrid } from '../shared/table-grid';
import { twipsToMm } from '../shared/units';
import { i16, u16, u8 } from './doc-sprm';

/** Word allows 15 levels of nesting; deeper depths are cut to this so a bad `sprmPItap` cannot recurse without end. */
export const MAX_TABLE_DEPTH = 15;

const TC80_SIZE = 20;
/** `TCGRF` bits: `fFirstMerged`, `fMerged`, `fVertMerge`, `fVertRestart`. */
const F_FIRST_MERGED = 0x01;
const F_MERGED = 0x02;
const F_VERT_MERGE = 0x20;
const F_VERT_RESTART = 0x40;
/** The width of a cell the row definition has no boundary for. */
const MADE_UP_WIDTH = 720;

/** One cell of a row definition: how it merges with its neighbours. */
export interface CellDef {
  hMerge?: 'first' | 'continue';
  vMerge?: 'first' | 'continue';
}

/** A row definition: `sprmTDefTable`. */
export interface RowDef {
  /** `rgdxaCenter[0]`, the row's left edge in twips. */
  left: number;
  /** The right boundary of each cell, twips. */
  rights: number[];
  cells: CellDef[];
}

/** The row-end paragraph's properties. */
export interface RowEnd {
  def?: RowDef;
  header: boolean;
}

/** A block of the document's text in order, with its place in the tables. */
export interface FlatItem {
  /** The block; none for a row end. */
  block?: Block;
  /** Table depth: 0 outside tables. */
  depth: number;
  /** The paragraph ends a cell. */
  cellEnd: boolean;
  /** Set on a row-end paragraph. */
  row?: RowEnd;
}

/** Reads the operand of `sprmTDefTable`: `itcMac`, `rgdxaCenter` (`itcMac + 1` values), then `itcMac` `TC80`s. */
export function readRowDef(operand: Uint8Array | undefined): RowDef | undefined {
  if (!operand || operand.length === 0) return undefined;
  const count = u8(operand);
  const tcAt = 1 + (count + 1) * 2;
  if (count === 0 || tcAt > operand.length) return undefined;
  const centers = Array.from({ length: count + 1 }, (_, i) => i16(operand.subarray(1 + i * 2)));
  const cells: CellDef[] = [];
  for (let i = 0; i < count; i++) {
    const at = tcAt + i * TC80_SIZE;
    // A truncated `TC80` list leaves the remaining cells unmerged.
    const flags = at + 2 <= operand.length ? u16(operand.subarray(at)) : 0;
    const cell: CellDef = {};
    if (flags & F_FIRST_MERGED) cell.hMerge = 'first';
    else if (flags & F_MERGED) cell.hMerge = 'continue';
    if (flags & F_VERT_RESTART) cell.vMerge = 'first';
    else if (flags & F_VERT_MERGE) cell.vMerge = 'continue';
    cells.push(cell);
  }
  return { left: centers[0] as number, rights: centers.slice(1), cells };
}

/** A finished row: its end paragraph (none when the row was never closed) and the blocks of each cell. */
interface RawRow {
  end?: RowEnd;
  cells: Block[][];
}

/** A cell after horizontal merging: the original cells `from` to `to`. */
interface Item {
  blocks: Block[];
  from: number;
  to: number;
  vMerge?: 'first' | 'continue';
}

const round = (value: number) => Math.round(value * 1000) / 1000;

function isEmpty(blocks: readonly Block[]): boolean {
  return blocks.every((block) => block.kind === 'paragraph' && block.inlines.length === 0 && !block.list);
}

/** The cells of a row with old-style horizontal merges applied: an `fMerged` cell is folded into the cell before it. */
function layoutOf(row: RawRow): { left: number; rights: number[]; items: Item[] } {
  const def = row.end?.def;
  const rights: number[] = [];
  const items: Item[] = [];
  let previousRight = def?.left ?? 0;
  row.cells.forEach((blocks, index) => {
    const right = def?.rights[index] ?? previousRight + MADE_UP_WIDTH;
    rights.push(right);
    previousRight = right;
    const cellDef = def?.cells[index];
    const last = items[items.length - 1];
    if (cellDef?.hMerge === 'continue' && last) {
      last.to = index;
      if (!isEmpty(blocks)) last.blocks.push(...blocks);
      return;
    }
    const item: Item = { blocks: [...blocks], from: index, to: index };
    if (cellDef?.vMerge) item.vMerge = cellDef.vMerge;
    items.push(item);
  });
  return { left: def?.left ?? 0, rights, items };
}

/** Builds a table from its rows: the column grid, spans from the boundaries, and the vertical merge flags as row spans. */
function buildTable(rows: readonly RawRow[]): Table {
  const layouts = rows.map(layoutOf);
  const grid = columnGrid(
    layouts.map((layout) => layout.rights),
    { lefts: layouts.map((layout) => layout.left) },
  );
  const origin = layouts.length ? Math.min(...layouts.map((layout) => layout.left)) : 0;
  const widths = grid.boundaries.map((boundary, i) =>
    Math.max(round(twipsToMm(boundary - (i === 0 ? origin : (grid.boundaries[i - 1] as number)))), 0),
  );

  const tableRows: TableRow[] = [];
  // Cells that a following continuing cell extends, by first column.
  let open = new Map<number, TableCell>();
  layouts.forEach(({ items }, rowIndex) => {
    const cells: TableCell[] = [];
    const nextOpen = new Map<number, TableCell>();
    for (const item of items) {
      const first = grid.cells[rowIndex]?.[item.from] ?? { column: 0, colSpan: 1 };
      const last = grid.cells[rowIndex]?.[item.to] ?? first;
      const place = { column: first.column, colSpan: last.column + last.colSpan - first.column };
      const owner = item.vMerge === 'continue' ? open.get(place.column) : undefined;
      if (owner) {
        owner.rowSpan = (owner.rowSpan ?? 1) + 1;
        nextOpen.set(place.column, owner);
        continue;
      }
      const cell: TableCell = { blocks: item.blocks };
      if (place.colSpan > 1) cell.colSpan = place.colSpan;
      const width = widths.slice(place.column, place.column + place.colSpan).reduce((sum, w) => sum + w, 0);
      if (width > 0) cell.widthMm = round(width);
      if (item.vMerge === 'first') nextOpen.set(place.column, cell);
      cells.push(cell);
    }
    open = nextOpen;
    const row: TableRow = { cells };
    if (rows[rowIndex]?.end?.header) row.header = true;
    tableRows.push(row);
  });

  const table: Table = { kind: 'table', rows: tableRows };
  if (widths.length > 0) table.columnWidthsMm = widths;
  return table;
}

/** Walks the flat items once, turning runs of table items into tables. */
class Grouper {
  private at = 0;

  constructor(private readonly items: readonly FlatItem[]) {}

  run(): Block[] {
    const blocks: Block[] = [];
    while (this.at < this.items.length) {
      const item = this.items[this.at] as FlatItem;
      if (item.depth === 0) {
        if (item.block) blocks.push(item.block);
        this.at++;
      } else {
        blocks.push(...this.table(1));
      }
    }
    return blocks;
  }

  /**
   * The rows at `depth`, up to the first item shallower than it. Consecutive rows are one table. A table whose last row
   * has no row end (inconsistent nesting, or a file cut short) is not built: its paragraphs are returned as they are,
   * to sit in the enclosing cell or the body.
   */
  private table(depth: number): Block[] {
    const rows: RawRow[] = [];
    let cells: Block[][] = [];
    let cell: Block[] = [];
    while (this.at < this.items.length && (this.items[this.at] as FlatItem).depth >= depth) {
      const item = this.items[this.at] as FlatItem;
      if (item.depth > depth) {
        cell.push(...this.table(depth + 1));
        continue;
      }
      this.at++;
      if (item.row) {
        // Content with no cell end before the row end still makes a last cell.
        if (cell.length > 0) cells.push(cell);
        if (cells.length > 0) rows.push({ end: item.row, cells });
        cells = [];
        cell = [];
        continue;
      }
      if (item.block) cell.push(item.block);
      if (item.cellEnd) {
        cells.push(cell);
        cell = [];
      }
    }
    if (cell.length > 0) cells.push(cell);
    if (cells.length > 0) rows.push({ cells });
    if (rows.some((row) => !row.end)) return rows.flatMap((row) => row.cells.flat());
    return rows.length > 0 ? [buildTable(rows)] : [];
  }
}

/** Groups paragraphs into tables as their depth, cell ends and row ends say; everything outside a table passes through. */
export function buildTables(items: readonly FlatItem[]): Block[] {
  return new Grouper(items).run();
}

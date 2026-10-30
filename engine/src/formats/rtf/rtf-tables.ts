import type { Block, Table, TableCell, TableRow } from '../../model/document-model';
import { columnGrid } from '../shared/table-grid';
import { twipsToMm } from '../shared/units';

/** One cell of a row definition: its right boundary and the `\cl…` properties read before its `\cellx`. */
export interface CellDef {
  right: number;
  hMerge?: 'first' | 'continue';
  vMerge?: 'first' | 'continue';
  /** `#rrggbb`. */
  background?: string;
}

/** A row definition: `\trowd` and what follows it up to the cells' content. */
export interface RowDef {
  /** `\trleft`, twips. */
  left: number;
  header: boolean;
  cells: CellDef[];
  /** Cell properties seen since the last `\cellx`. */
  pending: Omit<CellDef, 'right'>;
}

export function newRowDef(): RowDef {
  return { left: 0, header: false, cells: [], pending: {} };
}

/** A finished row: its definition and the blocks of each cell, in order. */
export interface RawRow {
  def: RowDef;
  cells: Block[][];
}

/** A cell after horizontal merging: the original cells `from` to `to` (indexes into the row's cell list). */
interface Item {
  blocks: Block[];
  from: number;
  to: number;
  vMerge?: 'first' | 'continue';
  background?: string;
}

interface RowLayout {
  /** The right boundary of every original cell. */
  rights: number[];
  items: Item[];
}

const round = (value: number) => Math.round(value * 1000) / 1000;

function isEmpty(blocks: readonly Block[]): boolean {
  return blocks.every((block) => block.kind === 'paragraph' && block.inlines.length === 0 && !block.list);
}

/** The cells of a row with horizontal merges applied: a `\clmrg` cell is folded into the cell before it. */
function layoutOf(row: RawRow): RowLayout {
  const rights: number[] = [];
  const items: Item[] = [];
  let previousRight = row.def.left;
  row.cells.forEach((blocks, index) => {
    const def = row.def.cells[index];
    // A cell without a boundary (more cells than `\cellx`) gets a made-up half-inch column.
    const right = def?.right ?? previousRight + 720;
    rights.push(right);
    previousRight = right;
    const last = items[items.length - 1];
    if (def?.hMerge === 'continue' && last) {
      last.to = index;
      if (!isEmpty(blocks)) last.blocks.push(...blocks);
      return;
    }
    const item: Item = { blocks: [...blocks], from: index, to: index };
    if (def?.vMerge) item.vMerge = def.vMerge;
    if (def?.background) item.background = def.background;
    items.push(item);
  });
  return { rights, items };
}

/** Builds a table from its rows: the column grid, spans from the boundaries and `\clvmgf`/`\clvmrg` as row spans. */
export function buildTable(rows: readonly RawRow[]): Table {
  const layouts = rows.map(layoutOf);
  const lefts = rows.map((row) => row.def.left);
  const grid = columnGrid(
    layouts.map((layout) => layout.rights),
    { lefts },
  );
  const origin = lefts.length ? Math.min(...lefts) : 0;
  const widths = grid.boundaries.map((boundary, i) =>
    Math.max(round(twipsToMm(boundary - (i === 0 ? origin : (grid.boundaries[i - 1] as number)))), 0),
  );

  const tableRows: TableRow[] = [];
  // Cells that a following `\clvmrg` cell continues, by first column.
  let open = new Map<number, TableCell>();
  layouts.forEach(({ items }, rowIndex) => {
    const cells: TableCell[] = [];
    const nextOpen = new Map<number, TableCell>();
    items.forEach((item) => {
      const first = grid.cells[rowIndex]?.[item.from] ?? { column: 0, colSpan: 1 };
      const last = grid.cells[rowIndex]?.[item.to] ?? first;
      const place = { column: first.column, colSpan: last.column + last.colSpan - first.column };
      const owner = item.vMerge === 'continue' ? open.get(place.column) : undefined;
      if (owner) {
        owner.rowSpan = (owner.rowSpan ?? 1) + 1;
        nextOpen.set(place.column, owner);
        return;
      }
      const cell: TableCell = { blocks: item.blocks };
      if (place.colSpan > 1) cell.colSpan = place.colSpan;
      const width = widths.slice(place.column, place.column + place.colSpan).reduce((sum, w) => sum + w, 0);
      if (width > 0) cell.widthMm = round(width);
      if (item.background) cell.background = item.background;
      if (item.vMerge === 'first') nextOpen.set(place.column, cell);
      cells.push(cell);
    });
    open = nextOpen;
    const row: TableRow = { cells };
    if (rows[rowIndex]?.def.header) row.header = true;
    tableRows.push(row);
  });

  const table: Table = { kind: 'table', rows: tableRows };
  if (widths.length > 0) table.columnWidthsMm = widths;
  return table;
}

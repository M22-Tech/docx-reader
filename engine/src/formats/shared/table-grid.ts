/** Where one cell sits in the table's column grid. */
export interface GridCell {
  /** Index of the first column the cell covers. */
  column: number;
  colSpan: number;
}

export interface ColumnGrid {
  /** The sorted right-hand column boundaries of the whole table. */
  boundaries: number[];
  /** For each input row, one entry per cell. */
  cells: GridCell[][];
}

/**
 * The column grid rule: the table's columns are the sorted set of all right-hand cell boundaries across its rows
 * (boundaries closer than `tolerance` count as one), and a cell spans the columns whose boundaries it covers.
 * `lefts` gives each row's left edge: the first cell of a row starts at the first column to the right of it (without
 * `lefts` every row starts at the first column).
 */
export function columnGrid(
  rows: readonly (readonly number[])[],
  options: { lefts?: readonly number[]; tolerance?: number } = {},
): ColumnGrid {
  const tolerance = options.tolerance ?? 3;
  const sorted = rows
    .flat()
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const boundaries: number[] = [];
  for (const value of sorted) {
    const last = boundaries[boundaries.length - 1];
    if (last === undefined || value - last > tolerance) boundaries.push(value);
  }

  // The first column whose boundary is at or beyond `value`, within the tolerance.
  function indexOf(value: number): number {
    let low = 0;
    let high = boundaries.length - 1;
    while (low < high) {
      const mid = (low + high) >> 1;
      if ((boundaries[mid] as number) >= value - tolerance) high = mid;
      else low = mid + 1;
    }
    return low;
  }

  const cells = rows.map((rights, rowIndex) => {
    const row: GridCell[] = [];
    const left = options.lefts?.[rowIndex];
    let next = left === undefined ? 0 : boundaries.findIndex((boundary) => boundary > left + tolerance);
    if (next === -1) next = boundaries.length;
    for (const right of rights) {
      const column = Math.min(next, Math.max(boundaries.length - 1, 0));
      const end = Number.isFinite(right) ? Math.max(indexOf(right), column) : column;
      row.push({ column, colSpan: end - column + 1 });
      next = end + 1;
    }
    return row;
  });
  return { boundaries, cells };
}

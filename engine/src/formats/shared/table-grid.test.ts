import { describe, expect, it } from 'vitest';
import { columnGrid } from './table-grid';

describe('columnGrid', () => {
  it('gives one column per boundary and a span of 1 for a regular table', () => {
    const grid = columnGrid([
      [100, 200, 300],
      [100, 200, 300],
    ]);
    expect(grid.boundaries).toEqual([100, 200, 300]);
    expect(grid.cells[1]).toEqual([
      { column: 0, colSpan: 1 },
      { column: 1, colSpan: 1 },
      { column: 2, colSpan: 1 },
    ]);
  });

  it('lets a cell that covers two boundaries span two columns (the features.rtf table)', () => {
    const grid = columnGrid(
      [
        [3014, 6023, 9031],
        [6023, 9031],
      ],
      { lefts: [5, 5] },
    );
    expect(grid.boundaries).toEqual([3014, 6023, 9031]);
    expect(grid.cells[1]).toEqual([
      { column: 0, colSpan: 2 },
      { column: 2, colSpan: 1 },
    ]);
  });

  it('builds the grid from the union of the rows when they differ', () => {
    const grid = columnGrid([[100, 300], [200, 300], [300]]);
    expect(grid.boundaries).toEqual([100, 200, 300]);
    expect(grid.cells.map((row) => row.map((c) => c.colSpan))).toEqual([[1, 2], [2, 1], [3]]);
  });

  it('starts a row that is indented at the first column to the right of its left edge', () => {
    const grid = columnGrid(
      [
        [100, 200, 300],
        [200, 300],
      ],
      { lefts: [0, 100] },
    );
    expect(grid.cells[1]).toEqual([
      { column: 1, colSpan: 1 },
      { column: 2, colSpan: 1 },
    ]);
  });

  it('treats boundaries within the tolerance as one', () => {
    const grid = columnGrid([
      [100, 200],
      [102, 199],
    ]);
    // A cluster is represented by its smallest value.
    expect(grid.boundaries).toEqual([100, 199]);
    expect(grid.cells[1]?.map((c) => c.colSpan)).toEqual([1, 1]);
    expect(columnGrid([[100], [110]], { tolerance: 0 }).boundaries).toEqual([100, 110]);
  });

  it('handles no rows, empty rows and non-ascending cells', () => {
    expect(columnGrid([])).toEqual({ boundaries: [], cells: [] });
    expect(columnGrid([[]]).cells).toEqual([[]]);
    const grid = columnGrid([[200, 100, 300]]);
    expect(grid.cells[0]?.every((c) => c.colSpan >= 1 && c.column >= 0)).toBe(true);
  });
});

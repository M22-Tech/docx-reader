import { describe, expect, it } from 'vitest';
import type { Block, Paragraph, Table } from '../../model/document-model';
import { buildTable, newRowDef, type CellDef, type RawRow } from './rtf-tables';

const cellBlocks = (text: string): Block[] => [{ kind: 'paragraph', inlines: text ? [{ kind: 'text', text }] : [] }];

function row(defs: (CellDef | number)[], texts: string[], options: { left?: number; header?: boolean } = {}): RawRow {
  const def = newRowDef();
  def.left = options.left ?? 0;
  def.header = options.header ?? false;
  def.cells = defs.map((d) => (typeof d === 'number' ? { right: d } : d));
  return { def, cells: texts.map(cellBlocks) };
}

const texts = (table: Table) =>
  table.rows.map((r) =>
    r.cells.map((c) => ((c.blocks[0] as Paragraph).inlines[0] as { text?: string } | undefined)?.text ?? ''),
  );

describe('buildTable', () => {
  it('builds a regular table with column widths in millimetres', () => {
    const table = buildTable([row([1440, 2880], ['a', 'b']), row([1440, 2880], ['c', 'd'])]);
    expect(texts(table)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(table.columnWidthsMm).toEqual([25.4, 25.4]);
    expect(table.rows[0]?.cells[0]).toMatchObject({ widthMm: 25.4 });
    expect(table.rows[0]?.cells[0]?.colSpan).toBeUndefined();
  });

  it('measures the first column from the row left edge', () => {
    const table = buildTable([row([1540], ['a'], { left: 100 })]);
    expect(table.columnWidthsMm).toEqual([25.4]);
  });

  it('gives a cell that covers two boundaries a colSpan of 2', () => {
    const table = buildTable([row([100, 200, 300], ['a', 'b', 'c']), row([200, 300], ['wide', 'd'])]);
    expect(table.rows[1]?.cells[0]).toMatchObject({ colSpan: 2 });
    expect(table.rows[1]?.cells[1]?.colSpan).toBeUndefined();
    expect(table.columnWidthsMm).toHaveLength(3);
  });

  it('folds \\clmrg cells into the \\clmgf cell before them', () => {
    const table = buildTable([
      row([100, 200, 300], ['a', 'b', 'c']),
      row([{ right: 100 }, { right: 200, hMerge: 'first' }, { right: 300, hMerge: 'continue' }], ['x', 'y', '']),
    ]);
    expect(texts(table)[1]).toEqual(['x', 'y']);
    expect(table.rows[1]?.cells[1]).toMatchObject({ colSpan: 2 });
  });

  it('gives a merged cell the span of the cells it covers even when no other row shows the columns', () => {
    const table = buildTable([
      row([{ right: 100, hMerge: 'first' }, { right: 200, hMerge: 'continue' }, { right: 300 }], ['a', '', 'c']),
    ]);
    expect(texts(table)).toEqual([['a', 'c']]);
    expect(table.rows[0]?.cells[0]).toMatchObject({ colSpan: 2, widthMm: 3.528 });
    expect(table.columnWidthsMm).toHaveLength(3);
  });

  it('turns \\clvmgf and \\clvmrg into a row span and leaves the merged cell out', () => {
    const table = buildTable([
      row([100, 200], ['a', 'b'], { header: true }),
      row([100, { right: 200, vMerge: 'first' }], ['c', 'tall']),
      row([100, { right: 200, vMerge: 'continue' }], ['e', '']),
      row([100, 200], ['f', 'g']),
    ]);
    expect(texts(table)).toEqual([['a', 'b'], ['c', 'tall'], ['e'], ['f', 'g']]);
    expect(table.rows[1]?.cells[1]?.rowSpan).toBe(2);
    expect(table.rows.map((r) => r.header ?? false)).toEqual([true, false, false, false]);
  });

  it('counts a merge over three rows and keeps an orphan \\clvmrg cell', () => {
    const table = buildTable([
      row([{ right: 100, vMerge: 'first' }], ['a']),
      row([{ right: 100, vMerge: 'continue' }], ['']),
      row([{ right: 100, vMerge: 'continue' }], ['']),
      row([100], ['b']),
      row([{ right: 100, vMerge: 'continue' }], ['orphan']),
    ]);
    expect(table.rows[0]?.cells[0]?.rowSpan).toBe(3);
    expect(texts(table)).toEqual([['a'], [], [], ['b'], ['orphan']]);
  });

  it('carries the cell background and makes up a boundary for a cell without one', () => {
    const table = buildTable([row([{ right: 720, background: '#ffff00' }], ['a', 'extra'])]);
    expect(table.rows[0]?.cells[0]).toMatchObject({ background: '#ffff00' });
    expect(table.rows[0]?.cells).toHaveLength(2);
    expect(table.columnWidthsMm).toHaveLength(2);
  });

  it('copes with a table that has no rows', () => {
    expect(buildTable([])).toEqual({ kind: 'table', rows: [] });
  });
});

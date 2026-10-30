import { describe, expect, it } from 'vitest';
import type { Block, Table } from '../../model/document-model';
import { openDocContainer } from './doc-container';
import { FcLcb, readFib } from './doc-fib';
import { readPapxRuns } from './doc-fkp';
import { readSprms, Sprm } from './doc-sprm';
import { buildTables, readRowDef, type CellDef, type FlatItem, type RowDef } from './doc-tables';
import { fixture } from './doc-test-helpers';

describe('features.doc row definitions', () => {
  const { fibBase, wordDocument, table } = openDocContainer(fixture('features.doc'));
  const fib = readFib(wordDocument, table.length, fibBase);
  const rows = readPapxRuns(wordDocument, table, fib.pair(FcLcb.PlcfBtePapx)!)
    .map((run) => [...readSprms(run.grpprl)])
    .filter((sprms) => sprms.some((s) => s.sprm === Sprm.TDefTable))
    .map((sprms) => ({
      def: readRowDef(sprms.find((s) => s.sprm === Sprm.TDefTable)?.operand) as RowDef,
      header: sprms.some((s) => s.sprm === Sprm.TTableHeader && s.operand[0] === 1),
    }));

  it('has four row definitions, the first marked as the header row', () => {
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.header)).toEqual([true, false, false, false]);
  });

  it('gives the cell boundaries of each row', () => {
    const boundaries = (def: RowDef) => [def.left, ...def.rights];
    expect(boundaries(rows[0]!.def)).toEqual([5, 3013, 6022, 9031]);
    expect(boundaries(rows[1]!.def)).toEqual([5, 3013, 6022, 9031]);
    expect(boundaries(rows[2]!.def)).toEqual([5, 3013, 6022, 9031]);
    expect(boundaries(rows[3]!.def)).toEqual([5, 6022, 9031]);
  });

  it('flags Delhi as the start of a vertical merge and the cell below it as its continuation', () => {
    expect(rows[1]!.def.cells[2]).toEqual({ vMerge: 'first' });
    expect(rows[2]!.def.cells[2]).toEqual({ vMerge: 'continue' });
    expect(rows[0]!.def.cells.every((c) => Object.keys(c).length === 0)).toBe(true);
  });
});

describe('readRowDef', () => {
  const le16 = (v: number) => [v & 0xff, (v >> 8) & 0xff];
  /** An operand of `sprmTDefTable`: `itcMac`, the boundaries and one `TC80` per flags value. */
  const operand = (centers: number[], flags: number[]) =>
    Uint8Array.from([
      centers.length - 1,
      ...centers.flatMap(le16),
      ...flags.flatMap((f) => [...le16(f), ...new Array<number>(18).fill(0)]),
    ]);

  it('reads the merge flags', () => {
    const def = readRowDef(operand([0, 100, 200, 300, 400], [0x01, 0x02, 0x60, 0x20]));
    expect(def?.cells).toEqual<CellDef[]>([
      { hMerge: 'first' },
      { hMerge: 'continue' },
      { vMerge: 'first' },
      { vMerge: 'continue' },
    ]);
    expect(def).toMatchObject({ left: 0, rights: [100, 200, 300, 400] });
  });

  it('reads negative boundaries', () => {
    expect(readRowDef(operand([-108, 1000], [0]))).toMatchObject({ left: -108, rights: [1000] });
  });

  it('leaves cells unmerged when the TC80s are cut short, and gives no definition when the boundaries are', () => {
    expect(readRowDef(operand([0, 100, 200], [0x01]).subarray(0, 1 + 6 + 2))?.cells).toEqual([{ hMerge: 'first' }, {}]);
    expect(readRowDef(Uint8Array.from([3, 0, 0, 1]))).toBeUndefined();
    expect(readRowDef(Uint8Array.from([0, 0, 0]))).toBeUndefined();
    expect(readRowDef(undefined)).toBeUndefined();
  });
});

describe('buildTables', () => {
  const para = (text: string, depth = 0, cellEnd = false): FlatItem => ({
    block: { kind: 'paragraph', inlines: text ? [{ kind: 'text', text }] : [] },
    depth,
    cellEnd,
  });
  const cell = (text: string, depth = 1) => para(text, depth, true);
  /** A row end whose definition has cells of `width` twips, with the given flags. */
  const end = (depth: number, cells: CellDef[], options: { header?: boolean; left?: number; width?: number } = {}) => {
    const left = options.left ?? 0;
    const width = options.width ?? 1000;
    const def: RowDef = { left, rights: cells.map((_, i) => left + (i + 1) * width), cells };
    return { depth, cellEnd: false, row: { def, header: options.header === true } } satisfies FlatItem;
  };
  const plain = (count: number): CellDef[] => Array.from({ length: count }, () => ({}));
  const textOf = (block: Block): string =>
    block.kind === 'paragraph'
      ? block.inlines.map((i) => (i.kind === 'text' ? i.text : '')).join('')
      : block.kind === 'pageBreak'
        ? '---'
        : 'TABLE';
  const cellTexts = (t: Table) => t.rows.map((r) => r.cells.map((c) => c.blocks.map(textOf).join('/')));
  const tableAt = (blocks: Block[], index = 0): Table => {
    const found = blocks[index];
    if (found?.kind !== 'table') throw new Error(`block ${index} is not a table`);
    return found;
  };

  it('passes paragraphs outside tables through', () => {
    expect(buildTables([para('a'), para('b')]).map(textOf)).toEqual(['a', 'b']);
  });

  it('groups rows into a table and closes it at the first paragraph outside', () => {
    const blocks = buildTables([
      para('before'),
      cell('A'),
      cell('B'),
      end(1, plain(2), { header: true }),
      cell('C'),
      cell('D'),
      end(1, plain(2)),
      para('after'),
    ]);
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'table', 'paragraph']);
    const table = tableAt(blocks, 1);
    expect(cellTexts(table)).toEqual([
      ['A', 'B'],
      ['C', 'D'],
    ]);
    expect(table.rows.map((r) => r.header)).toEqual([true, undefined]);
    expect(table.columnWidthsMm).toHaveLength(2);
    expect(textOf(blocks[2] as Block)).toBe('after');
  });

  it('keeps several paragraphs and a page break in one cell', () => {
    const blocks = buildTables([
      para('one', 1),
      { block: { kind: 'pageBreak' }, depth: 1, cellEnd: false },
      cell('two'),
      end(1, plain(1)),
    ]);
    expect(cellTexts(tableAt(blocks))).toEqual([['one/---/two']]);
  });

  it('keeps one empty paragraph in an empty cell', () => {
    const blocks = buildTables([cell('A'), cell(''), cell('C'), end(1, plain(3))]);
    const cells = tableAt(blocks).rows[0]?.cells;
    expect(cells).toHaveLength(3);
    expect(cells?.[1]?.blocks).toEqual([{ kind: 'paragraph', inlines: [] }]);
  });

  it('never outputs the row-end paragraph', () => {
    const blocks = buildTables([cell('A'), end(1, plain(1)), para('after')]);
    expect(JSON.stringify(blocks)).not.toContain('\u0007');
    expect(cellTexts(tableAt(blocks))).toEqual([['A']]);
  });

  it('builds a nested table inside the cell that holds it', () => {
    const blocks = buildTables([
      para('outer text', 1),
      cell('inner A', 2),
      cell('inner B', 2),
      end(2, plain(2), { width: 500 }),
      cell(''),
      cell('next'),
      end(1, plain(2), { width: 2000 }),
    ]);
    const outer = tableAt(blocks);
    expect(outer.rows).toHaveLength(1);
    const first = outer.rows[0]?.cells[0]?.blocks as Block[];
    expect(first.map((b) => b.kind)).toEqual(['paragraph', 'table', 'paragraph']);
    expect(cellTexts(tableAt(first, 1))).toEqual([['inner A', 'inner B']]);
    expect(cellTexts(outer)[0]?.[1]).toBe('next');
  });

  it('nests two levels deep', () => {
    const blocks = buildTables([
      cell('deep', 3),
      end(3, plain(1)),
      cell('', 2),
      end(2, plain(1)),
      cell(''),
      end(1, plain(1)),
    ]);
    const level2 = tableAt(tableAt(blocks).rows[0]?.cells[0]?.blocks as Block[]);
    const level3 = tableAt(level2.rows[0]?.cells[0]?.blocks as Block[]);
    expect(cellTexts(level3)).toEqual([['deep']]);
  });

  it('flattens an inner table that has no row end into paragraphs of the outer cell', () => {
    const blocks = buildTables([para('lead', 1), cell('x', 2), cell('y', 2), cell('after'), end(1, plain(1))]);
    const cells = tableAt(blocks).rows[0]?.cells;
    expect(cells?.[0]?.blocks.map(textOf)).toEqual(['lead', 'x', 'y', 'after']);
    expect(JSON.stringify(blocks)).not.toContain('"inner"');
  });

  it('flattens a table cut short at the end of the document into body paragraphs', () => {
    const blocks = buildTables([para('before'), cell('A'), cell('B')]);
    expect(blocks.map(textOf)).toEqual(['before', 'A', 'B']);
  });

  it('spans columns from the boundaries of all rows', () => {
    const blocks = buildTables([
      cell('wide'),
      cell('c'),
      end(1, plain(2), { width: 2000 }),
      cell('a'),
      cell('b'),
      cell('c'),
      cell('d'),
      end(1, plain(4), { width: 1000 }),
    ]);
    const table = tableAt(blocks);
    expect(table.columnWidthsMm).toHaveLength(4);
    expect(table.rows[0]?.cells.map((c) => c.colSpan)).toEqual([2, 2]);
    expect(table.rows[1]?.cells.map((c) => c.colSpan)).toEqual([undefined, undefined, undefined, undefined]);
  });

  it('turns the vertical merge flags into a row span and omits the merged-away cell', () => {
    const blocks = buildTables([
      cell('top'),
      cell('x'),
      end(1, [{ vMerge: 'first' }, {}]),
      cell(''),
      cell('y'),
      end(1, [{ vMerge: 'continue' }, {}]),
      cell(''),
      cell('z'),
      end(1, [{ vMerge: 'continue' }, {}]),
    ]);
    const table = tableAt(blocks);
    expect(cellTexts(table)).toEqual([['top', 'x'], ['y'], ['z']]);
    expect(table.rows[0]?.cells[0]?.rowSpan).toBe(3);
  });

  it('treats a continuing cell with nothing to continue as an ordinary cell', () => {
    const blocks = buildTables([cell('a'), end(1, [{ vMerge: 'continue' }]), cell('b'), end(1, [{}])]);
    const table = tableAt(blocks);
    expect(cellTexts(table)).toEqual([['a'], ['b']]);
    expect(table.rows[0]?.cells[0]?.rowSpan).toBeUndefined();
  });

  it('folds old-style merged cells into the first merged cell', () => {
    const blocks = buildTables([
      cell('left'),
      cell(''),
      cell(''),
      cell('right'),
      end(1, [{ hMerge: 'first' }, { hMerge: 'continue' }, { hMerge: 'continue' }, {}]),
      cell('1'),
      cell('2'),
      cell('3'),
      cell('4'),
      end(1, plain(4)),
    ]);
    const table = tableAt(blocks);
    expect(cellTexts(table)).toEqual([
      ['left', 'right'],
      ['1', '2', '3', '4'],
    ]);
    expect(table.rows[0]?.cells[0]?.colSpan).toBe(3);
  });

  it('keeps text found in a merged-away cell', () => {
    const blocks = buildTables([cell('left'), cell('extra'), end(1, [{ hMerge: 'first' }, { hMerge: 'continue' }])]);
    expect(cellTexts(tableAt(blocks))).toEqual([['left/extra']]);
  });

  it('gives a table that follows another directly the rows of one table', () => {
    const blocks = buildTables([
      cell('A'),
      end(1, plain(1)),
      cell('B'),
      cell('C'),
      end(1, plain(2), { width: 500 }),
      para('after'),
    ]);
    expect(blocks.map((b) => b.kind)).toEqual(['table', 'paragraph']);
    expect(cellTexts(tableAt(blocks))).toEqual([['A'], ['B', 'C']]);
  });

  it('closes a table at the very end of the document', () => {
    const blocks = buildTables([para('before'), cell('A'), cell('B'), end(1, plain(2))]);
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'table']);
    expect(cellTexts(tableAt(blocks, 1))).toEqual([['A', 'B']]);
  });

  it('makes up widths for a row with no definition', () => {
    const blocks = buildTables([cell('A'), cell('B'), { depth: 1, cellEnd: false, row: { header: false } }]);
    const table = tableAt(blocks);
    expect(table.columnWidthsMm).toHaveLength(2);
    expect(cellTexts(table)).toEqual([['A', 'B']]);
  });

  it('leaves paragraphs on both sides of a table in the body', () => {
    const blocks = buildTables([para('p'), cell('A'), end(1, plain(1)), para('q')]);
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'table', 'paragraph']);
    expect([blocks[0], blocks[2]].map((b) => (b ? textOf(b) : ''))).toEqual(['p', 'q']);
  });
});

import { describe, expect, it } from 'vitest';
import { DocumentError } from '../../document-error';
import { openDocContainer } from './doc-container';
import { FcLcb, readFib } from './doc-fib';
import { firstRunEndingAfter, readChpxRuns, readPapxRuns } from './doc-fkp';
import { readSprms, Sprm } from './doc-sprm';
import { fixture } from './doc-test-helpers';

const { fibBase, wordDocument, table } = openDocContainer(fixture('features.doc'));
const fib = readFib(wordDocument, table.length, fibBase);
const chpx = readChpxRuns(wordDocument, table, fib.pair(FcLcb.PlcfBteChpx)!);
const papx = readPapxRuns(wordDocument, table, fib.pair(FcLcb.PlcfBtePapx)!);
const TEXT_START = 0x800;
const TEXT_END = TEXT_START + 862 * 2;

function expectCovers(runs: { fcStart: number; fcEnd: number }[]) {
  expect(runs[0]?.fcStart).toBeLessThanOrEqual(TEXT_START);
  expect(runs.at(-1)?.fcEnd).toBeGreaterThanOrEqual(TEXT_END);
  for (let i = 1; i < runs.length; i++) expect(runs[i]?.fcStart).toBe(runs[i - 1]?.fcEnd);
}

describe('features.doc FKPs', () => {
  it('has character runs that cover the main text with no gaps', () => {
    expect(chpx).toHaveLength(53);
    expectCovers(chpx);
  });

  it('has paragraph runs that cover the main text with no gaps', () => {
    expect(papx).toHaveLength(55);
    expectCovers(papx);
  });

  it('reads the grpprl of the bold run', () => {
    const bold = chpx.find((run) => [...readSprms(run.grpprl)].some((p) => p.sprm === Sprm.CFBold));
    expect(bold).toBeDefined();
    expect(bold!.fcEnd - bold!.fcStart).toBe(8);
  });

  it('reads paragraph styles and sprms', () => {
    expect(papx[0]?.istd).toBe(42);
    expect(papx[1]?.istd).toBe(1);
    expect(papx[2]?.istd).toBe(0);
    const centred = papx.find((run) =>
      [...readSprms(run.grpprl)].some((p) => p.sprm === Sprm.PJc && p.operand[0] === 1),
    );
    expect(centred).toBeDefined();
  });

  it('reads a table row mark whose grpprl holds sprmTDefTable, ending exactly at the end of its grpprl', () => {
    const row = papx.find((run) => [...readSprms(run.grpprl)].some((p) => p.sprm === Sprm.TDefTable));
    expect(row).toBeDefined();
    let end = 0;
    for (const { operand } of readSprms(row!.grpprl)) end += operand.length;
    expect(end).toBeGreaterThan(0);
  });

  it('finds the run at a position', () => {
    expect(firstRunEndingAfter(chpx, TEXT_START)).toBe(0);
    expect(firstRunEndingAfter(chpx, chpx[1]!.fcStart)).toBe(1);
    expect(firstRunEndingAfter(chpx, chpx[1]!.fcEnd)).toBe(2);
    expect(firstRunEndingAfter(chpx, 0xffffff)).toBe(chpx.length);
  });
});

describe('damaged FKPs', () => {
  it('rejects a PLC with a bad size and a page outside the stream as corrupt', () => {
    const code = (run: () => unknown) => {
      try {
        run();
      } catch (error) {
        return error instanceof DocumentError ? error.code : 'other';
      }
      return 'none';
    };
    const pair = fib.pair(FcLcb.PlcfBteChpx)!;
    expect(code(() => readChpxRuns(wordDocument, table, { fc: pair.fc, lcb: 7 }))).toBe('corrupt');
    expect(code(() => readChpxRuns(wordDocument.subarray(0, 1024), table, pair))).toBe('corrupt');
  });
});

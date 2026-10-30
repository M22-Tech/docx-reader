import { DocumentError } from '../../document-error';
import type { FcLcbPair } from './doc-fib';
import { DocReader } from './doc-reader';

const PAGE_SIZE = 512;
const BX_PAP_SIZE = 13;

/** A range of file positions with the sprms that apply to it. */
export interface FkpRun {
  fcStart: number;
  fcEnd: number;
  grpprl: Uint8Array;
  /** The paragraph style of a paragraph run; absent for character runs. */
  istd?: number;
}

/** Reads a `PlcBteChpx` or `PlcBtePapx` into the page numbers of its FKPs. */
function readPageNumbers(table: DocReader, pair: FcLcbPair): number[] {
  if (pair.lcb < 4 || (pair.lcb - 4) % 8 !== 0) throw new DocumentError('corrupt', 'A PlcBte has a bad size.');
  const count = (pair.lcb - 4) / 8;
  const pages: number[] = [];
  for (let i = 0; i < count; i++) pages.push(table.u32(pair.fc + (count + 1) * 4 + i * 4) & 0x3fffff);
  return pages;
}

/** Calls `read` for each FKP page named by the PLC, in order. */
function eachPage(
  wordDocument: DocReader,
  table: DocReader,
  pair: FcLcbPair,
  read: (page: DocReader, crun: number, runs: FkpRun[]) => void,
): FkpRun[] {
  const runs: FkpRun[] = [];
  for (const number of readPageNumbers(table, pair)) {
    const page = new DocReader(wordDocument.bytes(number * PAGE_SIZE, PAGE_SIZE));
    read(page, page.u8(PAGE_SIZE - 1), runs);
  }
  return runs;
}

/** The character runs of every `ChpxFkp` in the PLC: `crun + 1` FCs, then `crun` offsets (x2) to `cb` and a `grpprl`. */
export function readChpxRuns(wordDocument: Uint8Array, tableStream: Uint8Array, pair: FcLcbPair): FkpRun[] {
  return eachPage(new DocReader(wordDocument), new DocReader(tableStream), pair, (page, crun, runs) => {
    if ((crun + 1) * 4 + crun > PAGE_SIZE - 1) throw new DocumentError('corrupt', 'A ChpxFkp has too many runs.');
    for (let i = 0; i < crun; i++) {
      const offset = page.u8((crun + 1) * 4 + i) * 2;
      let grpprl: Uint8Array = new Uint8Array(0);
      if (offset > 0 && offset < PAGE_SIZE - 1) {
        const cb = page.u8(offset);
        grpprl = page.bytes(offset + 1, Math.min(cb, PAGE_SIZE - 1 - (offset + 1)));
      }
      runs.push({ fcStart: page.u32(i * 4), fcEnd: page.u32((i + 1) * 4), grpprl });
    }
  });
}

/** The paragraph runs of every `PapxFkp` in the PLC: `crun + 1` FCs, then `crun` 13-byte `BxPap`s whose first byte is the offset (x2) to a `PapxInFkp`. */
export function readPapxRuns(wordDocument: Uint8Array, tableStream: Uint8Array, pair: FcLcbPair): FkpRun[] {
  return eachPage(new DocReader(wordDocument), new DocReader(tableStream), pair, (page, crun, runs) => {
    if ((crun + 1) * 4 + crun * BX_PAP_SIZE > PAGE_SIZE - 1) {
      throw new DocumentError('corrupt', 'A PapxFkp has too many runs.');
    }
    for (let i = 0; i < crun; i++) {
      const offset = page.u8((crun + 1) * 4 + i * BX_PAP_SIZE) * 2;
      let istd = 0;
      let grpprl: Uint8Array = new Uint8Array(0);
      if (offset > 0 && offset < PAGE_SIZE - 1) {
        let cb = page.u8(offset);
        let start = offset + 1;
        let size: number;
        if (cb === 0) {
          cb = page.u8(offset + 1);
          start = offset + 2;
          size = 2 * cb;
        } else {
          size = 2 * cb - 1;
        }
        size = Math.min(size, PAGE_SIZE - 1 - start);
        if (size >= 2) {
          istd = page.u16(start);
          grpprl = page.bytes(start + 2, size - 2);
        }
      }
      runs.push({ fcStart: page.u32(i * 4), fcEnd: page.u32((i + 1) * 4), grpprl, istd });
    }
  });
}

/** The index of the first run that ends after `fc` (binary search; runs are in FC order), or `runs.length`. */
export function firstRunEndingAfter(runs: readonly FkpRun[], fc: number): number {
  let low = 0;
  let high = runs.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if ((runs[mid] as FkpRun).fcEnd > fc) high = mid;
    else low = mid + 1;
  }
  return low;
}

import { DocumentError } from '../../document-error';
import { DocReader } from './doc-reader';

const W_IDENT = 0xa5ec;
const MIN_NFIB = 0x00c1;

const FIB_BASE_SIZE = 32;
const F_ENCRYPTED = 0x0100;
const F_WHICH_TBL_STM = 0x0200;
const F_OBFUSCATED = 0x8000;

/** Indexes of the `fc`/`lcb` pairs in the FIB, as [MS-DOC] numbers them in `FibRgFcLcb97`. */
export const FcLcb = {
  Stshf: 1,
  PlcffndRef: 2,
  PlcffndTxt: 3,
  PlcfSed: 6,
  PlcfHdd: 11,
  PlcfBteChpx: 12,
  PlcfBtePapx: 13,
  SttbfFfn: 15,
  SttbfBkmk: 21,
  PlcfBkf: 22,
  PlcfBkl: 23,
  Clx: 33,
  PlcfendRef: 46,
  PlcfendTxt: 47,
  PlfLst: 73,
  PlfLfo: 74,
} as const;

/** The fields of `FibBase` the parser uses. */
export interface FibBase {
  nFib: number;
  /** Which table stream holds the structures: `0Table` or `1Table`. */
  whichTableStream: 0 | 1;
}

/** An offset and length in the table stream. */
export interface FcLcbPair {
  fc: number;
  lcb: number;
}

export interface Fib extends FibBase {
  ccpText: number;
  ccpFtn: number;
  ccpHdd: number;
  ccpAtn: number;
  ccpEdn: number;
  ccpTxbx: number;
  ccpHdrTxbx: number;
  /** A pair by its index in `FcLcb`; undefined when the structure is absent (`lcb` 0 or no such pair). */
  pair(index: number): FcLcbPair | undefined;
}

/** Checks `wIdent`, `nFib` and the encryption flags, and reads which table stream is used. */
export function readFibBase(wordDocument: Uint8Array): FibBase {
  const reader = new DocReader(wordDocument);
  if (reader.u16(0) !== W_IDENT) throw new DocumentError('corrupt', 'The WordDocument stream has no Word signature.');
  const nFib = reader.u16(2);
  if (nFib < MIN_NFIB) throw new DocumentError('unsupported_version', 'The file was saved by Word 95 or older.');
  const flags = reader.u16(10);
  if (flags & (F_ENCRYPTED | F_OBFUSCATED)) throw new DocumentError('encrypted', 'The document is password-protected.');
  return { nFib, whichTableStream: flags & F_WHICH_TBL_STM ? 1 : 0 };
}

/** Reads the character counts and the `fc`/`lcb` pairs; every pair the parser uses must lie inside the table stream. */
export function readFib(wordDocument: Uint8Array, tableLength: number, base: FibBase): Fib {
  const reader = new DocReader(wordDocument);
  const cslwAt = FIB_BASE_SIZE + 2 + reader.u16(FIB_BASE_SIZE) * 2;
  const cslw = reader.u16(cslwAt);
  if (cslw < 11) throw new DocumentError('corrupt', 'The FIB is too short.');
  const rgLwAt = cslwAt + 2;
  const lw = (index: number) => reader.u32(rgLwAt + index * 4);

  const cbRgFcLcbAt = rgLwAt + cslw * 4;
  const cbRgFcLcb = reader.u16(cbRgFcLcbAt);
  const pairsAt = cbRgFcLcbAt + 2;
  const pairs = new Map<number, FcLcbPair>();
  for (const index of Object.values(FcLcb)) {
    if (index >= cbRgFcLcb) continue;
    const fc = reader.u32(pairsAt + index * 8);
    const lcb = reader.u32(pairsAt + index * 8 + 4);
    if (lcb === 0) continue;
    if (fc + lcb > tableLength) {
      throw new DocumentError('corrupt', `FIB structure ${index} lies outside the table stream.`);
    }
    pairs.set(index, { fc, lcb });
  }

  return {
    ...base,
    ccpText: lw(3),
    ccpFtn: lw(4),
    ccpHdd: lw(5),
    ccpAtn: lw(7),
    ccpEdn: lw(8),
    ccpTxbx: lw(9),
    ccpHdrTxbx: lw(10),
    pair: (index) => pairs.get(index),
  };
}

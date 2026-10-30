import { describe, expect, it } from 'vitest';
import { DocumentError } from '../../document-error';
import { openDocContainer } from './doc-container';
import { FcLcb, readFib } from './doc-fib';
import { editStreams, FIB_OFFSET, fixture, setU16, setU32 } from './doc-test-helpers';

const fibOf = (bytes: Uint8Array) => {
  const { fibBase, wordDocument, table } = openDocContainer(bytes);
  return readFib(wordDocument, table.length, fibBase);
};
const codeOf = (action: () => unknown) => {
  try {
    action();
  } catch (error) {
    return error instanceof DocumentError ? error.code : 'other';
  }
  return 'none';
};

describe('features.doc', () => {
  const fib = fibOf(fixture('features.doc'));

  it('reads the version and the table stream', () => {
    expect(fib.nFib).toBe(0x0101);
    expect(fib.whichTableStream).toBe(1);
  });

  it('reads the character counts', () => {
    expect(fib).toMatchObject({
      ccpText: 862,
      ccpFtn: 51,
      ccpHdd: 81,
      ccpAtn: 0,
      ccpEdn: 0,
      ccpTxbx: 0,
      ccpHdrTxbx: 0,
    });
  });

  it('reads the fc/lcb pairs by index', () => {
    expect(fib.pair(FcLcb.Stshf)).toEqual({ fc: 0, lcb: 2604 });
    expect(fib.pair(FcLcb.Clx)).toEqual({ fc: 5364, lcb: 21 });
    expect(fib.pair(FcLcb.PlcfBteChpx)).toEqual({ fc: 2702, lcb: 12 });
    expect(fib.pair(FcLcb.PlcfBtePapx)).toEqual({ fc: 2714, lcb: 52 });
    expect(fib.pair(FcLcb.SttbfFfn)).toEqual({ fc: 5385, lcb: 1064 });
    expect(fib.pair(FcLcb.PlfLst)).toEqual({ fc: 2828, lcb: 142 });
    expect(fib.pair(FcLcb.PlfLfo)).toEqual({ fc: 5208, lcb: 104 });
    expect(fib.pair(FcLcb.PlcffndRef)).toEqual({ fc: 2604, lcb: 10 });
  });

  it('treats a pair with lcb 0 as absent', () => {
    expect(fib.pair(FcLcb.PlcfendRef)).toBeUndefined();
    expect(fib.pair(FcLcb.PlcfendTxt)).toBeUndefined();
  });
});

describe('minimal.doc', () => {
  const fib = fibOf(fixture('minimal.doc'));

  it('has 15 characters of text and no footnotes', () => {
    expect(fib.ccpText).toBe(15);
    expect(fib.pair(FcLcb.PlcffndRef)).toBeUndefined();
  });
});

describe('FIB errors', () => {
  const features = fixture('features.doc');
  const withWordDocument = (edit: (stream: Uint8Array) => void) => editStreams(features, { WordDocument: edit });

  it('rejects a wrong wIdent as corrupt', () => {
    expect(codeOf(() => openDocContainer(withWordDocument((s) => setU16(s, 0, 0x1234))))).toBe('corrupt');
  });

  it('rejects Word 95 as unsupported_version', () => {
    expect(codeOf(() => openDocContainer(withWordDocument((s) => setU16(s, FIB_OFFSET.nFib, 0x0065))))).toBe(
      'unsupported_version',
    );
  });

  it('accepts the oldest supported nFib', () => {
    expect(fibOf(withWordDocument((s) => setU16(s, FIB_OFFSET.nFib, 0x00c1))).nFib).toBe(0x00c1);
  });

  it.each([0x0100, 0x8000])('rejects the encryption flag 0x%s as encrypted', (flag) => {
    const bytes = withWordDocument((s) => setU16(s, FIB_OFFSET.flags, 0x0200 | flag));
    expect(codeOf(() => openDocContainer(bytes))).toBe('encrypted');
  });

  it('reports a Word 95 file before looking for its table stream', () => {
    const bytes = editStreams(features, { '1Table': null, WordDocument: (s) => setU16(s, FIB_OFFSET.nFib, 0x0065) });
    expect(codeOf(() => openDocContainer(bytes))).toBe('unsupported_version');
  });

  it('rejects a missing table stream as corrupt', () => {
    expect(codeOf(() => openDocContainer(editStreams(features, { '1Table': null })))).toBe('corrupt');
  });

  it('uses 0Table when fWhichTblStm is clear', () => {
    const bytes = withWordDocument((s) => setU16(s, FIB_OFFSET.flags, 0));
    expect(codeOf(() => openDocContainer(bytes))).toBe('corrupt');
  });

  it('rejects a pair outside the table stream as corrupt', () => {
    expect(codeOf(() => fibOf(withWordDocument((s) => setU32(s, FIB_OFFSET.clxLcb, 0x00ffffff))))).toBe('corrupt');
  });

  it('rejects a truncated FIB as corrupt', () => {
    const bytes = withWordDocument(() => undefined);
    const { fibBase, table } = openDocContainer(bytes);
    const short = new Uint8Array(100);
    setU16(short, 0, 0xa5ec);
    expect(codeOf(() => readFib(short, table.length, fibBase))).toBe('corrupt');
  });
});

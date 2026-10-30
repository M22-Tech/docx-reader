import { describe, expect, it } from 'vitest';
import { DocumentError } from '../../document-error';
import { openDocContainer } from './doc-container';
import { FcLcb, readFib } from './doc-fib';
import { bytesOf16, clxOf, compressedFc, fixture } from './doc-test-helpers';
import { readDocText } from './doc-text';

const codeOf = (action: () => unknown) => {
  try {
    action();
  } catch (error) {
    return error instanceof DocumentError ? error.code : 'other';
  }
  return 'none';
};
const clxPair = (clx: Uint8Array) => ({ fc: 0, lcb: clx.length });

describe('features.doc', () => {
  const { fibBase, wordDocument, table } = openDocContainer(fixture('features.doc'));
  const fib = readFib(wordDocument, table.length, fibBase);
  const text = readDocText(wordDocument, table, fib.pair(FcLcb.Clx)!);

  it('has one Unicode piece at 0x800 covering CPs 0 to 995', () => {
    expect(text.pieces).toEqual([{ cpStart: 0, cpEnd: 995, fc: 0x800, compressed: false, prm: 0 }]);
    expect(text.cpEnd).toBe(995);
    expect(text.prcs).toEqual([]);
  });

  it('gives the main text', () => {
    const main = text.text(0, fib.ccpText);
    expect(main).toHaveLength(862);
    expect(main.startsWith('Feature fixture\r')).toBe(true);
    expect(main.endsWith('\r')).toBe(true);
  });

  it('gives the footnote and header ranges after the main text', () => {
    expect(text.text(fib.ccpText, fib.ccpText + fib.ccpFtn)).toContain(
      'This is footnote one, at the bottom of the page.',
    );
    const headerStart = fib.ccpText + fib.ccpFtn;
    expect(text.text(headerStart, headerStart + fib.ccpHdd)).toContain('Fixture header text');
  });

  it('maps CPs to byte offsets', () => {
    expect(text.cpToFc(0)).toBe(0x800);
    expect(text.cpToFc(10)).toBe(0x800 + 20);
    expect(text.cpToFc(994)).toBe(0x800 + 1988);
    expect(text.cpToFc(995)).toBeUndefined();
  });
});

describe('built pieces', () => {
  it('decodes a compressed piece as Windows-1252', () => {
    const wordDocument = Uint8Array.from([0x41, 0x93, 0x94, 0x80, 0x42]);
    const clx = clxOf([{ length: 5, rawFc: compressedFc(0) }]);
    const text = readDocText(wordDocument, clx, clxPair(clx));
    expect(text.pieces[0]).toMatchObject({ compressed: true, fc: 0 });
    expect(text.text(0, 5)).toBe('A“”€B');
    expect(text.text(1, 4)).toBe('“”€');
  });

  describe('a compressed and a Unicode piece', () => {
    // "ab" compressed at byte 4, then "cd€" as UTF-16 at byte 8.
    const wordDocument = new Uint8Array(20);
    wordDocument.set([0x61, 0x62], 4);
    wordDocument.set(bytesOf16('cd€'), 8);
    const clx = clxOf([
      { length: 2, rawFc: compressedFc(4) },
      { length: 3, rawFc: 8, prm: 0x1234 },
    ]);
    const text = readDocText(wordDocument, clx, clxPair(clx));

    it('reads text across the boundary', () => {
      expect(text.text(0, 5)).toBe('abcd€');
      expect(text.text(1, 3)).toBe('bc');
      expect(text.text(2, 2)).toBe('');
      expect(text.cpEnd).toBe(5);
    });

    it('keeps each piece with its Prm', () => {
      expect(text.pieces.map((p) => [p.cpStart, p.cpEnd, p.compressed, p.prm])).toEqual([
        [0, 2, true, 0],
        [2, 5, false, 0x1234],
      ]);
    });

    it('looks up file positions at and across piece boundaries', () => {
      expect(text.cpToFc(0)).toBe(4);
      expect(text.cpToFc(1)).toBe(5);
      expect(text.cpToFc(2)).toBe(8);
      expect(text.cpToFc(3)).toBe(10);
      expect(text.cpToFc(4)).toBe(12);
      expect(text.cpToFc(5)).toBeUndefined();
      expect(text.cpToFc(-1)).toBeUndefined();
    });
  });

  it('skips empty pieces when looking up a position', () => {
    const wordDocument = Uint8Array.from([0x61, 0x62, 0x63]);
    const clx = clxOf([
      { length: 1, rawFc: compressedFc(0) },
      { length: 0, rawFc: compressedFc(0) },
      { length: 2, rawFc: compressedFc(1) },
    ]);
    const text = readDocText(wordDocument, clx, clxPair(clx));
    expect(text.cpToFc(1)).toBe(1);
    expect(text.text(0, 3)).toBe('abc');
  });

  it('keeps the Prc grpprls before the Pcdt', () => {
    const clx = clxOf([{ length: 1, rawFc: compressedFc(0) }], [[1, 2, 3], [4]]);
    const text = readDocText(Uint8Array.from([0x61]), clx, clxPair(clx));
    expect(text.prcs.map((p) => [...p])).toEqual([[1, 2, 3], [4]]);
    expect(text.text(0, 1)).toBe('a');
  });

  it('keeps a lone surrogate as one character so CPs stay string indexes', () => {
    const clx = clxOf([{ length: 3, rawFc: 0 }]);
    const text = readDocText(bytesOf16('a\ud800b'), clx, clxPair(clx));
    expect(text.text(0, 3)).toBe('a\ud800b');
  });

  describe('errors', () => {
    const word = Uint8Array.from([0x61, 0x62]);
    const good = clxOf([{ length: 2, rawFc: compressedFc(0) }]);

    it('rejects a piece outside WordDocument', () => {
      const clx = clxOf([{ length: 3, rawFc: compressedFc(0) }]);
      expect(codeOf(() => readDocText(word, clx, clxPair(clx)))).toBe('corrupt');
      const unicode = clxOf([{ length: 2, rawFc: 0 }]);
      expect(codeOf(() => readDocText(word, unicode, clxPair(unicode)))).toBe('corrupt');
    });

    it('rejects a Clx without a piece table', () => {
      const prcOnly = Uint8Array.from([0x01, 0x01, 0x00, 0x07]);
      expect(codeOf(() => readDocText(word, prcOnly, clxPair(prcOnly)))).toBe('corrupt');
    });

    it('rejects an unknown entry type, a bad PlcPcd size and a Pcdt running past the Clx', () => {
      const unknown = Uint8Array.from([0x05, 0, 0, 0, 0]);
      expect(codeOf(() => readDocText(word, unknown, clxPair(unknown)))).toBe('corrupt');
      const badSize = Uint8Array.from(good);
      badSize[1] = 15;
      expect(codeOf(() => readDocText(word, badSize, clxPair(badSize)))).toBe('corrupt');
      expect(codeOf(() => readDocText(word, good, { fc: 0, lcb: good.length - 2 }))).toBe('corrupt');
    });

    it('rejects a Prc running past the Clx', () => {
      const prc = Uint8Array.from([0x01, 0xff, 0x00, 0x07]);
      expect(codeOf(() => readDocText(word, prc, clxPair(prc)))).toBe('corrupt');
    });

    it('rejects CPs that do not start at 0 or go backwards', () => {
      const shifted = Uint8Array.from(good);
      shifted[5] = 1;
      expect(codeOf(() => readDocText(word, shifted, clxPair(shifted)))).toBe('corrupt');
      const backwards = clxOf([
        { length: 2, rawFc: compressedFc(0) },
        { length: 0, rawFc: compressedFc(0) },
      ]);
      backwards[5 + 8] = 0; // the third CP drops below the second
      expect(codeOf(() => readDocText(word, backwards, clxPair(backwards)))).toBe('corrupt');
    });

    it('rejects a text range outside the pieces', () => {
      const text = readDocText(word, good, clxPair(good));
      expect(codeOf(() => text.text(0, 3))).toBe('corrupt');
      expect(codeOf(() => text.text(2, 1))).toBe('corrupt');
      expect(codeOf(() => text.text(-1, 1))).toBe('corrupt');
    });
  });
});

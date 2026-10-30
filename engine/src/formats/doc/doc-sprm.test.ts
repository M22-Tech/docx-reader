import { describe, expect, it } from 'vitest';
import { i16, prm0Sprm, readSprms, Sprm, u16, u32 } from './doc-sprm';

const bytes = (...values: number[]) => Uint8Array.from(values);
const sprmBytes = (sprm: number) => [sprm & 0xff, sprm >> 8];
const read = (grpprl: Uint8Array) => [...readSprms(grpprl)].map(({ sprm, operand }) => [sprm, [...operand]]);
const BOLD = [...sprmBytes(Sprm.CFBold), 1];

describe('readSprms operand sizes', () => {
  it.each([
    ['spra 0', 0x0835, [1]],
    ['spra 1', 0x2a3e, [2]],
    ['spra 2', 0x4a43, [0x16, 0x00]],
    ['spra 3', 0x6870, [0xc0, 0, 0, 0xff]],
    ['spra 4', 0x9023, [0xa0, 0x05]],
    ['spra 5', 0xb01f, [0xc2, 0x2e]],
    ['spra 7', 0xf614, [1, 2, 3]],
  ])('%s', (_name, sprm, operand) => {
    expect(read(bytes(...sprmBytes(sprm), ...operand, ...BOLD))).toEqual([
      [sprm, operand],
      [Sprm.CFBold, [1]],
    ]);
  });

  it('reads a variable operand after its size byte, without the size byte', () => {
    expect(read(bytes(0x47, 0xca, 3, 7, 8, 9, ...BOLD))).toEqual([
      [0xca47, [7, 8, 9]],
      [Sprm.CFBold, [1]],
    ]);
  });

  it('reads sprmTDefTable with a 2-byte size that counts itself and the data, less one', () => {
    const data = [1, 2, 3, 4, 5];
    const size = data.length + 1;
    expect(read(bytes(...sprmBytes(Sprm.TDefTable), size & 0xff, size >> 8, ...data, ...BOLD))).toEqual([
      [Sprm.TDefTable, data],
      [Sprm.CFBold, [1]],
    ]);
    const long = Array.from({ length: 299 }, (_, i) => i & 0xff);
    expect(read(bytes(...sprmBytes(Sprm.TDefTable), 0x2c, 0x01, ...long, ...BOLD))[1]).toEqual([Sprm.CFBold, [1]]);
  });

  it('reads sprmPChgTabs by its own rule: a size byte, or 255 and the counts', () => {
    expect(read(bytes(...sprmBytes(Sprm.PChgTabs), 3, 1, 2, 3, ...BOLD))).toEqual([
      [Sprm.PChgTabs, [1, 2, 3]],
      [Sprm.CFBold, [1]],
    ]);
    // 255, then 1 deleted tab (2-byte position, 2-byte close), 2 added tabs (2-byte position each, 1 byte of descriptor each).
    const counted = [1, 0xa, 0xb, 0xc, 0xd, 2, 1, 1, 2, 2, 7, 8];
    expect(read(bytes(...sprmBytes(Sprm.PChgTabs), 255, ...counted, ...BOLD))).toEqual([
      [Sprm.PChgTabs, counted],
      [Sprm.CFBold, [1]],
    ]);
  });

  it('skips an unknown sprm by its size', () => {
    expect(read(bytes(0xff, 0x4f, 9, 9, ...BOLD))).toEqual([
      [0x4fff, [9, 9]],
      [Sprm.CFBold, [1]],
    ]);
  });
});

describe('readSprms on a truncated grpprl', () => {
  it('stops at a sprm with no operand or a short one, keeping the earlier ones', () => {
    expect(read(bytes(...BOLD, 0x35))).toEqual([[Sprm.CFBold, [1]]]);
    expect(read(bytes(...BOLD, 0x43, 0x4a, 0x16))).toEqual([[Sprm.CFBold, [1]]]);
    expect(read(bytes(...BOLD, 0x6a, 0x68, 1, 2))).toEqual([[Sprm.CFBold, [1]]]);
  });

  it('stops at a variable operand longer than the rest', () => {
    expect(read(bytes(...BOLD, 0x47, 0xca, 9, 1, 2))).toEqual([[Sprm.CFBold, [1]]]);
    expect(read(bytes(...BOLD, 0x47, 0xca))).toEqual([[Sprm.CFBold, [1]]]);
    expect(read(bytes(...BOLD, ...sprmBytes(Sprm.TDefTable), 0xff, 0x00, 1))).toEqual([[Sprm.CFBold, [1]]]);
    expect(read(bytes(...BOLD, ...sprmBytes(Sprm.PChgTabs), 255, 4))).toEqual([[Sprm.CFBold, [1]]]);
    expect(read(bytes(...BOLD, ...sprmBytes(Sprm.PChgTabs)))).toEqual([[Sprm.CFBold, [1]]]);
  });

  it('gives nothing for an empty grpprl', () => {
    expect(read(bytes())).toEqual([]);
  });
});

describe('operand readers and Prm0', () => {
  it('reads little-endian numbers', () => {
    expect(u16(bytes(0x34, 0x12))).toBe(0x1234);
    expect(i16(bytes(0xfe, 0xff))).toBe(-2);
    expect(u32(bytes(0x78, 0x56, 0x34, 0xff))).toBe(0xff345678);
  });

  it('maps the isprm values of the character sprms it reads', () => {
    expect(prm0Sprm(0x55)).toBe(Sprm.CFBold);
    expect(prm0Sprm(0x5c)).toBe(Sprm.CFVanish);
    expect(prm0Sprm(0x41)).toBe(Sprm.CFRMarkDel);
    expect(prm0Sprm(0x00)).toBeUndefined();
  });
});

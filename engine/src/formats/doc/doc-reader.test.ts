import { describe, expect, it } from 'vitest';
import { DocumentError } from '../../document-error';
import { DocReader } from './doc-reader';

const reader = new DocReader(Uint8Array.from([0x01, 0xff, 0xfe, 0xff, 0xff, 0xff, 0x41, 0x00, 0x42, 0x00]));

describe('DocReader', () => {
  it('reads little-endian integers', () => {
    expect(reader.u8(0)).toBe(1);
    expect(reader.u16(0)).toBe(0xff01);
    expect(reader.i16(1)).toBe(-257);
    expect(reader.u32(2)).toBe(0xfffffffe);
    expect(reader.i32(2)).toBe(-2);
  });

  it('reads bytes and UTF-16 text', () => {
    expect([...reader.bytes(6, 2)]).toEqual([0x41, 0]);
    expect(reader.utf16(6, 2)).toBe('AB');
    expect(reader.utf16(6, 0)).toBe('');
  });

  it('throws corrupt for any read past the end or before the start', () => {
    const codes = [
      () => reader.u8(10),
      () => reader.u16(9),
      () => reader.u32(7),
      () => reader.i32(7),
      () => reader.bytes(8, 3),
      () => reader.utf16(8, 2),
      () => reader.u8(-1),
      () => reader.u8(1.5),
    ].map((read) => {
      try {
        read();
      } catch (error) {
        return error instanceof DocumentError ? error.code : 'other';
      }
      return 'none';
    });
    expect(codes).toEqual(Array<string>(8).fill('corrupt'));
  });

  it('reads a view over part of a larger buffer', () => {
    const inner = new DocReader(new Uint8Array([9, 9, 7, 0, 9]).subarray(2, 4));
    expect(inner.u16(0)).toBe(7);
    expect(() => inner.u8(2)).toThrow(DocumentError);
  });
});

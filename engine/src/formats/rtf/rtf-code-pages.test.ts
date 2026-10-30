import { describe, expect, it } from 'vitest';
import { codePageOfCharset, decodeBytes } from './rtf-code-pages';

describe('decodeBytes', () => {
  it('reads Windows-1252', () => {
    expect(decodeBytes(Uint8Array.of(0x63, 0x61, 0x66, 0xe9, 0x80), 1252)).toBe('café€');
  });

  it('reads Windows-1251 Cyrillic', () => {
    expect(decodeBytes(Uint8Array.of(0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2), 1251)).toBe('Привет');
  });

  it('decodes consecutive bytes together for a double-byte code page', () => {
    expect(decodeBytes(Uint8Array.of(0x82, 0xa0, 0x82, 0xa2), 932)).toBe('あい');
    expect(decodeBytes(Uint8Array.of(0xc4, 0xe3, 0xba, 0xc3), 936)).toBe('你好');
  });

  it('turns Symbol bytes into private-use characters', () => {
    expect(decodeBytes(Uint8Array.of(0xb7, 0x20), 42)).toBe(' ');
  });

  it('falls back to 1252 for a code page it does not know', () => {
    expect(decodeBytes(Uint8Array.of(0xe9), 437)).toBe('é');
  });
});

describe('codePageOfCharset', () => {
  it('maps the charsets from the design', () => {
    const expected: [number, number][] = [
      [2, 42],
      [128, 932],
      [129, 949],
      [134, 936],
      [136, 950],
      [161, 1253],
      [162, 1254],
      [177, 1255],
      [178, 1256],
      [186, 1257],
      [204, 1251],
      [222, 874],
      [238, 1250],
    ];
    for (const [charset, codePage] of expected) expect(codePageOfCharset(charset)).toBe(codePage);
  });

  it('keeps the document code page for ANSI and unknown charsets', () => {
    expect(codePageOfCharset(0)).toBeUndefined();
    expect(codePageOfCharset(77)).toBeUndefined();
    expect(codePageOfCharset(undefined)).toBeUndefined();
  });
});

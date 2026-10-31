import { describe, expect, it } from 'vitest';
import { base64ToBytes, firstVisibleBlock, pickMode, viewportContent } from './viewer-helpers';

function toBase64(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));
}

describe('base64ToBytes', () => {
  it('decodes with and without padding', () => {
    expect(Array.from(base64ToBytes('AQID'))).toEqual([1, 2, 3]);
    expect(Array.from(base64ToBytes('AQI='))).toEqual([1, 2]);
    expect(Array.from(base64ToBytes('AQ=='))).toEqual([1]);
    expect(base64ToBytes('')).toHaveLength(0);
  });

  it('decodes input longer than one chunk', () => {
    const input = Uint8Array.from({ length: 100_003 }, (_, i) => (i * 7) % 256);
    expect(base64ToBytes(toBase64(input))).toEqual(input);
  });

  it('throws on invalid base64', () => {
    expect(() => base64ToBytes('@@@@')).toThrow();
  });
});

describe('pickMode', () => {
  it('keeps the requested mode when available', () => {
    expect(pickMode('raw', ['raw', 'rendered'])).toBe('raw');
    expect(pickMode('rendered', ['rendered'])).toBe('rendered');
  });

  it('falls back to the adapter mode', () => {
    expect(pickMode('raw', ['rendered'])).toBe('rendered');
  });
});

describe('firstVisibleBlock', () => {
  it('returns the first block at or below the top', () => {
    const blocks = [
      { index: 0, top: -120 },
      { index: 1, top: -10 },
      { index: 2, top: 0 },
      { index: 3, top: 80 },
    ];
    expect(firstVisibleBlock(blocks)).toBe(2);
  });

  it('is undefined when there are no blocks or all are above', () => {
    expect(firstVisibleBlock([])).toBeUndefined();
    expect(firstVisibleBlock([{ index: 0, top: -5 }])).toBeUndefined();
  });
});

describe('viewportContent', () => {
  it('fits Raw to the page width', () => {
    expect(viewportContent('raw', 793.7)).toBe('width=794, user-scalable=yes, maximum-scale=4');
  });

  it('turns zoom off for Rendered', () => {
    expect(viewportContent('rendered', undefined)).toBe('width=device-width, initial-scale=1, user-scalable=no');
  });

  it('uses the device width for Raw without a usable page width', () => {
    expect(viewportContent('raw', undefined)).toBe('width=device-width, initial-scale=1, user-scalable=no');
    expect(viewportContent('raw', NaN)).toBe('width=device-width, initial-scale=1, user-scalable=no');
  });
});

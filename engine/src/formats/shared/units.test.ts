import { describe, expect, it } from 'vitest';
import { halfPointsToPt, parseLength, twipsToMm, twipsToPt, twipsToPx } from './units';

describe('parseLength', () => {
  it('converts every unit to millimetres, points and pixels', () => {
    const cases: [string, number, number, number][] = [
      ['25.4mm', 25.4, 72, 96],
      ['2.54cm', 25.4, 72, 96],
      ['1in', 25.4, 72, 96],
      ['72pt', 25.4, 72, 96],
      ['6pc', 25.4, 72, 96],
      ['96px', 25.4, 72, 96],
      ['0.5in', 12.7, 36, 48],
    ];
    for (const [text, mm, pt, px] of cases) {
      const length = parseLength(text);
      expect(length?.mm, text).toBeCloseTo(mm, 9);
      expect(length?.pt, text).toBeCloseTo(pt, 9);
      expect(length?.px, text).toBeCloseTo(px, 9);
    }
  });

  it('reads signs, leading dots, spaces and upper case units', () => {
    expect(parseLength('-0.25in')?.mm).toBeCloseTo(-6.35, 9);
    expect(parseLength('+.5cm')?.mm).toBeCloseTo(5, 9);
    expect(parseLength(' 10 PT ')?.pt).toBeCloseTo(10, 9);
    expect(parseLength('3.cm')?.mm).toBeCloseTo(30, 9);
  });

  it('gives undefined for percentages, bare numbers, unknown units and empty values', () => {
    for (const text of ['50%', '12', '12em', 'cm', '', '1e3mm', 'auto', '1 2cm']) {
      expect(parseLength(text), text).toBeUndefined();
    }
    expect(parseLength(undefined)).toBeUndefined();
    expect(parseLength(null)).toBeUndefined();
  });
});

describe('twips and half-points', () => {
  it('converts twips to millimetres, points and pixels', () => {
    expect(twipsToMm(1440)).toBeCloseTo(25.4, 9);
    expect(twipsToMm(11906)).toBeCloseTo(210, 1);
    expect(twipsToMm(-720)).toBeCloseTo(-12.7, 9);
    expect(twipsToPt(1440)).toBe(72);
    expect(twipsToPt(20)).toBe(1);
    expect(twipsToPx(1440)).toBe(96);
    expect(twipsToPx(3600)).toBe(240);
  });

  it('converts half-points to points', () => {
    expect(halfPointsToPt(22)).toBe(11);
    expect(halfPointsToPt(25)).toBe(12.5);
  });
});

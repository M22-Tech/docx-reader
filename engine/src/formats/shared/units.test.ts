import { describe, expect, it } from 'vitest';
import { parseLength } from './units';

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

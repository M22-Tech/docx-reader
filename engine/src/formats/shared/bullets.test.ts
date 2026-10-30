import { describe, expect, it } from 'vitest';
import { bulletFor } from './bullets';

describe('bulletFor', () => {
  it('keeps the plain bullet characters', () => {
    for (const marker of ['•', '◦', '▪', '■', '●', '○', '-']) expect(bulletFor(marker)).toBe(marker);
  });

  it('trims spaces and a tab around the marker', () => {
    expect(bulletFor(' •\t')).toBe('•');
    expect(bulletFor(' ◦ ')).toBe('◦');
  });

  it('maps Symbol and Wingdings characters to • ◦ ▪', () => {
    expect(bulletFor('')).toBe('•');
    expect(bulletFor('')).toBe('▪');
    expect(bulletFor('')).toBe('◦');
    expect(bulletFor('')).toBe('•');
  });

  it('maps an unknown private-use character to •', () => {
    expect(bulletFor('')).toBe('•');
  });

  it('is not a bullet for numbers, letters and longer text', () => {
    for (const marker of ['1.', 'a)', 'iv.', 'o', '--', '', '  ', '1', '•x'])
      expect(bulletFor(marker), marker).toBeUndefined();
  });
});

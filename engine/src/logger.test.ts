import { describe, expect, it } from 'vitest';
import { roundMs, timed } from './logger';

describe('roundMs', () => {
  it('rounds to 3 decimals', () => {
    expect(roundMs(1.23456)).toBe(1.235);
    expect(roundMs(0.0004)).toBe(0);
    expect(roundMs(12)).toBe(12);
  });
});

describe('timed', () => {
  it('returns the result of the step', async () => {
    expect(await timed('step', () => 42)).toBe(42);
    expect(await timed('step', () => Promise.resolve('x'))).toBe('x');
  });

  it('passes errors through', async () => {
    await expect(timed('step', () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
  });
});

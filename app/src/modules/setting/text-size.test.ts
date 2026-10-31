import { TEXT_SIZES } from '../../config/constants';
import { canStepTextSize, stepTextSize } from './text-size';

describe('stepTextSize', () => {
  it('steps through the sizes of the spec', () => {
    expect(TEXT_SIZES).toEqual([14, 16, 18, 20, 22, 24, 28, 32]);
    expect(stepTextSize(18, 'larger')).toBe(20);
    expect(stepTextSize(18, 'smaller')).toBe(16);
    expect(stepTextSize(24, 'larger')).toBe(28);
    expect(stepTextSize(28, 'smaller')).toBe(24);
  });

  it('stays at the ends', () => {
    expect(stepTextSize(14, 'smaller')).toBe(14);
    expect(stepTextSize(32, 'larger')).toBe(32);
  });
});

describe('canStepTextSize', () => {
  it('is false for smaller at 14 and for larger at 32 only', () => {
    expect(canStepTextSize(14, 'smaller')).toBe(false);
    expect(canStepTextSize(14, 'larger')).toBe(true);
    expect(canStepTextSize(32, 'larger')).toBe(false);
    expect(canStepTextSize(32, 'smaller')).toBe(true);
    expect(canStepTextSize(18, 'smaller')).toBe(true);
    expect(canStepTextSize(18, 'larger')).toBe(true);
  });
});

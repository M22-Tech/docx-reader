import { TEXT_SIZES, type TextSize } from '../../config/constants';

export type TextSizeStep = 'smaller' | 'larger';

/** The size one step away, or the same size at the end of the range. */
export function stepTextSize(size: TextSize, step: TextSizeStep): TextSize {
  const index = TEXT_SIZES.indexOf(size) + (step === 'larger' ? 1 : -1);
  return TEXT_SIZES[Math.min(Math.max(index, 0), TEXT_SIZES.length - 1)] ?? size;
}

/** Whether the step is available (the button is disabled at its end of the range). */
export function canStepTextSize(size: TextSize, step: TextSizeStep): boolean {
  return stepTextSize(size, step) !== size;
}

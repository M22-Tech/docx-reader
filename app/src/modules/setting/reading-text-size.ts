import { READING_TEXT_SIZES, type ReadingTextSize } from '../../config/constants';

export type TextSizeStep = 'smaller' | 'larger';

/** The size one step away, or the same size at the end of the range. */
export function stepTextSize(size: ReadingTextSize, step: TextSizeStep): ReadingTextSize {
  const index = READING_TEXT_SIZES.indexOf(size) + (step === 'larger' ? 1 : -1);
  return READING_TEXT_SIZES[Math.min(Math.max(index, 0), READING_TEXT_SIZES.length - 1)] ?? size;
}

/** Whether the step is available (the button is disabled at its end of the range). */
export function canStepTextSize(size: ReadingTextSize, step: TextSizeStep): boolean {
  return stepTextSize(size, step) !== size;
}

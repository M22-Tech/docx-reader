import { describe, expect, it } from 'vitest';
import { headingLevelFor } from './heading-rule';

describe('headingLevelFor', () => {
  it('uses an outline level of 1 to 6 as it is and caps 7 to 9 at 6', () => {
    expect(headingLevelFor({ outlineLevel: 1, styleNames: [] })).toBe(1);
    expect(headingLevelFor({ outlineLevel: 6, styleNames: [] })).toBe(6);
    expect(headingLevelFor({ outlineLevel: 7, styleNames: [] })).toBe(6);
    expect(headingLevelFor({ outlineLevel: 9, styleNames: [] })).toBe(6);
  });

  it('lets the outline level win over the style names', () => {
    expect(headingLevelFor({ outlineLevel: 3, styleNames: ['Heading 1'] })).toBe(3);
  });

  it('ignores outline levels outside 1 to 9', () => {
    expect(headingLevelFor({ outlineLevel: 0, styleNames: ['Normal'] })).toBeUndefined();
    expect(headingLevelFor({ outlineLevel: 10, styleNames: ['Normal'] })).toBeUndefined();
    expect(headingLevelFor({ outlineLevel: Number.NaN, styleNames: [] })).toBeUndefined();
    expect(headingLevelFor({ outlineLevel: 0, styleNames: ['Heading 2'] })).toBe(2);
  });

  it('reads Heading 1 to 9 case-insensitively, with 7 to 9 becoming 6', () => {
    expect(headingLevelFor({ styleNames: ['Heading 1'] })).toBe(1);
    expect(headingLevelFor({ styleNames: ['heading 4'] })).toBe(4);
    expect(headingLevelFor({ styleNames: ['HEADING 6'] })).toBe(6);
    expect(headingLevelFor({ styleNames: ['Heading 9'] })).toBe(6);
    expect(headingLevelFor({ styleNames: ['Heading2'] })).toBe(2);
  });

  it('maps Title to 1 and Subtitle to 2', () => {
    expect(headingLevelFor({ styleNames: ['Title'] })).toBe(1);
    expect(headingLevelFor({ styleNames: ['subtitle'] })).toBe(2);
  });

  it('takes the nearest matching name, so a style based on a heading is a heading', () => {
    expect(headingLevelFor({ styleNames: ['P1', 'Heading 1', 'Standard'] })).toBe(1);
    expect(headingLevelFor({ styleNames: ['Heading 3', 'Heading 1'] })).toBe(3);
  });

  it('gives undefined for other names', () => {
    expect(
      headingLevelFor({ styleNames: ['Standard', 'Heading', 'Heading 10', 'Titles', 'Heading 0'] }),
    ).toBeUndefined();
    expect(headingLevelFor({ styleNames: [] })).toBeUndefined();
  });
});

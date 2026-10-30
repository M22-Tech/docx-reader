import { describe, expect, it } from 'vitest';
import {
  applyParaSprms,
  characterStyleOf,
  marksOf,
  paragraphFields,
  resolveCharProps,
  resolveParaProps,
  type ParaProps,
} from './doc-properties';
import { Sprm } from './doc-sprm';
import { createStyleSheet, type StyleDef } from './doc-styles';

const bytes = (...values: number[]) => Uint8Array.from(values);
const sprm = (id: number, ...operand: number[]) => [id & 0xff, id >> 8, ...operand];
const grpprl = (...parts: number[][]) => bytes(...parts.flat());
const NONE = new Uint8Array(0);

const style = (istd: number, over: Partial<StyleDef>): StyleDef => ({
  istd,
  sti: istd,
  kind: 'paragraph',
  name: `S${istd}`,
  paraGrpprl: NONE,
  charGrpprl: NONE,
  ...over,
});

const ELEVEN_PT = sprm(Sprm.CHps, 22, 0);
/** A style sheet whose Normal style sets 11 pt, the size the renderers leave unmarked. */
const plain = createStyleSheet([style(0, { name: 'Normal', charGrpprl: grpprl(ELEVEN_PT) })]);
const boldStyle = createStyleSheet([style(0, { name: 'Normal', charGrpprl: grpprl(ELEVEN_PT, sprm(Sprm.CFBold, 1)) })]);
const marks = (run: Uint8Array, styles = plain, fonts: string[] = []) =>
  marksOf(resolveCharProps(styles, 0, [run]), fonts).marks;

describe('toggle properties', () => {
  it('sets a toggle with 0 and 1', () => {
    expect(marks(grpprl(sprm(Sprm.CFBold, 1)))).toEqual({ bold: true });
    expect(marks(grpprl(sprm(Sprm.CFBold, 0)), boldStyle)).toBeUndefined();
  });

  it('keeps the style value with 0x80 and flips it with 0x81', () => {
    expect(marks(grpprl(sprm(Sprm.CFBold, 0x80)), boldStyle)).toEqual({ bold: true });
    expect(marks(grpprl(sprm(Sprm.CFBold, 0x80)))).toBeUndefined();
    expect(marks(grpprl(sprm(Sprm.CFBold, 0x81)), boldStyle)).toBeUndefined();
    expect(marks(grpprl(sprm(Sprm.CFBold, 0x81)))).toEqual({ bold: true });
  });

  it('covers italic and strike, and drops hidden and deleted text', () => {
    expect(marks(grpprl(sprm(Sprm.CFItalic, 1), sprm(Sprm.CFStrike, 1)))).toEqual({ italic: true, strike: true });
    expect(marksOf(resolveCharProps(plain, 0, [grpprl(sprm(Sprm.CFVanish, 1))]), []).dropped).toBe(true);
    expect(marksOf(resolveCharProps(plain, 0, [grpprl(sprm(Sprm.CFRMarkDel, 1))]), []).dropped).toBe(true);
    expect(marksOf(resolveCharProps(plain, 0, [grpprl(sprm(Sprm.CFVanish, 0))]), []).dropped).toBe(false);
  });
});

describe('colours', () => {
  it('reads the 16-colour palette, with index 0 as auto', () => {
    expect(marks(grpprl(sprm(Sprm.CIco, 6)))).toEqual({ color: '#ff0000' });
    expect(marks(grpprl(sprm(Sprm.CIco, 9)))).toEqual({ color: '#000080' });
    expect(marks(grpprl(sprm(Sprm.CIco, 0)))).toBeUndefined();
    expect(marks(grpprl(sprm(Sprm.CHighlight, 7)))).toEqual({ highlight: '#ffff00' });
    expect(marks(grpprl(sprm(Sprm.CHighlight, 0)))).toBeUndefined();
  });

  it('reads a COLORREF, where a high byte of 0xFF means auto, and lets it win over the palette', () => {
    expect(marks(grpprl(sprm(Sprm.CCv, 0xc0, 0x00, 0x00, 0x00)))).toEqual({ color: '#c00000' });
    expect(marks(grpprl(sprm(Sprm.CCv, 0x12, 0xab, 0x0f, 0x00)))).toEqual({ color: '#12ab0f' });
    expect(marks(grpprl(sprm(Sprm.CCv, 0, 0, 0, 0xff)))).toBeUndefined();
    expect(marks(grpprl(sprm(Sprm.CIco, 2), sprm(Sprm.CCv, 0xc0, 0, 0, 0)))).toEqual({ color: '#c00000' });
    expect(marks(grpprl(sprm(Sprm.CIco, 2), sprm(Sprm.CCv, 0, 0, 0, 0xff)))).toBeUndefined();
  });
});

describe('size, script, underline and font', () => {
  it('reads sizes in half-points and leaves out 11 pt', () => {
    expect(marks(grpprl(sprm(Sprm.CHps, 36, 0)))).toEqual({ fontSizePt: 18 });
    expect(marks(grpprl(sprm(Sprm.CHps, 17, 0)))).toEqual({ fontSizePt: 8.5 });
    expect(marks(grpprl(sprm(Sprm.CHps, 22, 0)))).toBeUndefined();
  });

  it('uses 10 pt when nothing sets a size', () => {
    expect(marks(NONE, createStyleSheet([]))).toEqual({ fontSizePt: 10 });
  });

  it('maps script and underline', () => {
    expect(marks(grpprl(sprm(Sprm.CIss, 1), sprm(Sprm.CHps, 22, 0)))).toEqual({ superscript: true });
    expect(marks(grpprl(sprm(Sprm.CIss, 2), sprm(Sprm.CHps, 22, 0)))).toEqual({ subscript: true });
    expect(marks(grpprl(sprm(Sprm.CKul, 1), sprm(Sprm.CHps, 22, 0)))).toEqual({ underline: true });
    expect(marks(grpprl(sprm(Sprm.CKul, 0), sprm(Sprm.CHps, 22, 0)))).toBeUndefined();
  });

  it('takes the Latin font from sprmCRgFtc0, or from sprmCRgFtc2 when it is absent', () => {
    const fonts = ['A', 'B', 'C'];
    const size = sprm(Sprm.CHps, 22, 0);
    expect(marks(grpprl(size, sprm(Sprm.CRgFtc0, 1, 0)), plain, fonts)).toEqual({ fontFamily: 'B' });
    expect(marks(grpprl(size, sprm(Sprm.CRgFtc0, 0, 0)), plain, fonts)).toEqual({ fontFamily: 'A' });
    expect(marks(grpprl(size, sprm(Sprm.CRgFtc2, 2, 0)), plain, fonts)).toEqual({ fontFamily: 'C' });
    expect(marks(grpprl(size, sprm(Sprm.CRgFtc2, 2, 0), sprm(Sprm.CRgFtc0, 1, 0)), plain, fonts)).toEqual({
      fontFamily: 'B',
    });
    expect(marks(grpprl(size, sprm(Sprm.CRgFtc0, 9, 0)), plain, fonts)).toBeUndefined();
  });
});

describe('order of application', () => {
  const styles = createStyleSheet([
    style(0, { name: 'Normal', charGrpprl: grpprl(sprm(Sprm.CHps, 22, 0)) }),
    style(1, { name: 'Body', istdBase: 0, charGrpprl: grpprl(sprm(Sprm.CFBold, 1), sprm(Sprm.CIco, 6)) }),
    style(2, { name: 'Emph', kind: 'character', charGrpprl: grpprl(sprm(Sprm.CFItalic, 1), sprm(Sprm.CIco, 2)) }),
  ]);

  it('applies the paragraph style, then the character style, then the run, then the piece', () => {
    const run = grpprl(sprm(Sprm.CIstd, 2, 0), sprm(Sprm.CFBold, 0x81));
    const piece = grpprl(sprm(Sprm.CIco, 4));
    expect(marksOf(resolveCharProps(styles, 1, [run, NONE]), []).marks).toEqual({ italic: true, color: '#0000ff' });
    expect(marksOf(resolveCharProps(styles, 1, [run, piece]), []).marks).toEqual({ italic: true, color: '#00ff00' });
    expect(marksOf(resolveCharProps(styles, 1, [NONE, NONE]), []).marks).toEqual({ bold: true, color: '#ff0000' });
  });

  it('finds the character style a grpprl names', () => {
    expect(characterStyleOf(grpprl(sprm(Sprm.CFBold, 1), sprm(Sprm.CIstd, 7, 0)))).toBe(7);
    expect(characterStyleOf(NONE)).toBeUndefined();
  });
});

describe('paragraph properties', () => {
  it('lets sprmPJc (0x2461) win over sprmPJc80 (0x2403) whichever comes first', () => {
    for (const order of [
      [sprm(Sprm.PJc80, 1), sprm(Sprm.PJc, 2)],
      [sprm(Sprm.PJc, 2), sprm(Sprm.PJc80, 1)],
    ]) {
      const props = resolveParaProps(plain, 0, grpprl(...order));
      expect(paragraphFields(props, []).align).toBe('right');
    }
    expect(paragraphFields(resolveParaProps(plain, 0, grpprl(sprm(Sprm.PJc80, 1))), []).align).toBe('center');
  });

  it('maps alignments: 0 left (unset), 1 center, 2 right, 3 to 5 justify', () => {
    const align = (jc: number) => paragraphFields(resolveParaProps(plain, 0, grpprl(sprm(Sprm.PJc, jc))), []).align;
    expect([0, 1, 2, 3, 4, 5, 6].map(align)).toEqual([
      undefined,
      'center',
      'right',
      'justify',
      'justify',
      'justify',
      undefined,
    ]);
  });

  it('lets the newer indent sprms win over the 80 variants, and converts twips to mm', () => {
    const props: ParaProps = {};
    applyParaSprms(
      props,
      grpprl(
        sprm(Sprm.PDxaLeft80, 0x20, 0x03),
        sprm(Sprm.PDxaLeft, 0xd0, 0x02),
        sprm(Sprm.PDxaRight80, 0x20, 0x03),
        sprm(Sprm.PDxaLeft180, 0x00, 0xfe),
        sprm(Sprm.PDxaLeft1, 0x30, 0xfd),
      ),
    );
    const fields = paragraphFields(props, []);
    expect(fields.indentLeftMm).toBeCloseTo((720 * 25.4) / 1440, 3);
    expect(fields.indentRightMm).toBeCloseTo((800 * 25.4) / 1440, 3);
    expect(fields.firstLineMm).toBeCloseTo((-720 * 25.4) / 1440, 3);
  });

  it('converts spacing to points and a multiple line height', () => {
    const props = resolveParaProps(
      plain,
      0,
      grpprl(sprm(Sprm.PDyaBefore, 0xa0, 0), sprm(Sprm.PDyaAfter, 0xc8, 0), sprm(Sprm.PDyaLine, 0x68, 0x01, 1, 0)),
    );
    expect(paragraphFields(props, [])).toEqual({ spaceBeforePt: 8, spaceAfterPt: 10, lineHeight: 1.5 });
    const exact = resolveParaProps(plain, 0, grpprl(sprm(Sprm.PDyaLine, 0x68, 0x01, 0, 0)));
    expect(paragraphFields(exact, []).lineHeight).toBeUndefined();
    const single = resolveParaProps(plain, 0, grpprl(sprm(Sprm.PDyaLine, 0xf0, 0x00, 1, 0)));
    expect(paragraphFields(single, []).lineHeight).toBeUndefined();
  });

  it('applies the style chain from the root down, then the paragraph', () => {
    const styles = createStyleSheet([
      style(0, { name: 'Normal', paraGrpprl: grpprl(sprm(Sprm.PJc, 2), sprm(Sprm.PDyaAfter, 0xa0, 0)) }),
      style(1, { name: 'Child', istdBase: 0, paraGrpprl: grpprl(sprm(Sprm.PJc, 1)) }),
    ]);
    expect(paragraphFields(resolveParaProps(styles, 1, NONE), [])).toEqual({ align: 'center', spaceAfterPt: 8 });
    expect(paragraphFields(resolveParaProps(styles, 1, grpprl(sprm(Sprm.PJc, 0))), [])).toEqual({ spaceAfterPt: 8 });
    expect(resolveParaProps(styles, 1, grpprl(sprm(Sprm.PFPageBreakBefore, 1))).pageBreakBefore).toBe(true);
  });

  it('applies the heading rule with style names and the outline level', () => {
    const level = (names: string[], outline?: number) =>
      paragraphFields(
        resolveParaProps(plain, 0, outline === undefined ? NONE : grpprl(sprm(Sprm.POutLvl, outline))),
        names,
      ).headingLevel;
    expect(level(['Heading 2', 'Normal'])).toBe(2);
    expect(level(['My heading', 'Heading 3', 'Normal'])).toBe(3);
    expect(level(['Title'])).toBe(1);
    expect(level(['Normal'])).toBeUndefined();
    expect(level(['Normal'], 2)).toBe(3);
    expect(level(['Heading 1'], 4)).toBe(5);
    expect(level(['Normal'], 9)).toBeUndefined();
    expect(level(['Heading 1'], 9)).toBe(1);
  });
});

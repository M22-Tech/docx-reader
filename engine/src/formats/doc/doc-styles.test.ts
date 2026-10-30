import { describe, expect, it } from 'vitest';
import { DocumentError } from '../../document-error';
import { openDocContainer } from './doc-container';
import { FcLcb, readFib } from './doc-fib';
import { readFontNames } from './doc-fonts';
import { createStyleSheet, readStyleSheet, type StyleDef } from './doc-styles';
import { fixture } from './doc-test-helpers';

const { fibBase, wordDocument, table } = openDocContainer(fixture('features.doc'));
const fib = readFib(wordDocument, table.length, fibBase);
const sheet = readStyleSheet(table, fib.pair(FcLcb.Stshf)!);

const style = (istd: number, istdBase?: number): StyleDef => ({
  istd,
  sti: istd,
  kind: 'paragraph',
  ...(istdBase === undefined ? {} : { istdBase }),
  name: `S${istd}`,
  paraGrpprl: new Uint8Array(0),
  charGrpprl: new Uint8Array(0),
});

describe('features.doc style sheet', () => {
  it('has 60 styles and a 10-byte STD base', () => {
    expect(sheet.styles).toHaveLength(60);
    expect(sheet.cbStdBaseInFile).toBe(10);
  });

  it('names style 0 Normal, 1 to 6 Heading 1 to 6, and 42 Title', () => {
    expect(sheet.styles[0]).toMatchObject({ istd: 0, name: 'Normal', kind: 'paragraph' });
    for (let i = 1; i <= 6; i++) expect(sheet.styles[i]).toMatchObject({ sti: i, name: `Heading ${i}`, istdBase: 0 });
    expect(sheet.styles[42]).toMatchObject({ name: 'Title', sti: 62 });
  });

  it('keeps the property lists of a style', () => {
    expect(sheet.styles[0]?.paraGrpprl.length).toBeGreaterThan(0);
    expect(sheet.styles[1]?.charGrpprl.length).toBeGreaterThan(0);
  });

  it('resolves a chain from the root down', () => {
    expect(sheet.chain(1).map((s) => s.name)).toEqual(['Normal', 'Heading 1']);
    expect(sheet.chain(0).map((s) => s.name)).toEqual(['Normal']);
    expect(sheet.chain(undefined)).toEqual([]);
    expect(sheet.chain(5000)).toEqual([]);
  });

  it('reads character styles', () => {
    const characterStyles = sheet.styles.filter((s) => s?.kind === 'character');
    expect(characterStyles.length).toBeGreaterThan(0);
    expect(characterStyles.some((s) => s?.name === 'Hyperlink')).toBe(true);
  });
});

describe('createStyleSheet', () => {
  it('does not hang on a loop in the chain', () => {
    const loop = createStyleSheet([style(0, 1), style(1, 0)]);
    expect(
      loop
        .chain(0)
        .map((s) => s.istd)
        .sort(),
    ).toEqual([0, 1]);
    expect(createStyleSheet([style(0, 0)]).chain(0)).toHaveLength(1);
  });
});

describe('damaged style sheets', () => {
  it('rejects a truncated STSH as corrupt', () => {
    const pair = fib.pair(FcLcb.Stshf)!;
    expect(() => readStyleSheet(table, { fc: pair.fc, lcb: 100 })).toThrow(DocumentError);
    expect(() => readStyleSheet(table, { fc: pair.fc, lcb: 3 })).toThrow(DocumentError);
  });
});

describe('features.doc fonts', () => {
  const fonts = readFontNames(table, fib.pair(FcLcb.SttbfFfn)!);

  it('lists the names by index', () => {
    expect(fonts[0]).toBe('Times New Roman');
    expect(fonts).toContain('Georgia');
    expect(fonts).toContain('Courier New');
    expect(fonts[7]).toBe('Courier New');
    expect(fonts).toHaveLength(16);
  });
});

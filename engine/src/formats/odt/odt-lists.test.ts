import { describe, expect, it } from 'vitest';
import { formatNumber, ListNumbering, readListStyles, type ListStyle } from './odt-lists';
import { contentXml, documents, stylesXml } from './odt-test-helpers';

const number = (level: number, attrs = '', align = '') =>
  `<text:list-level-style-number text:level="${level}" ${attrs}>${align}</text:list-level-style-number>`;
const bullet = (level: number, char: string, attrs = '') =>
  `<text:list-level-style-bullet text:level="${level}" text:bullet-char="${char}" ${attrs}/>`;
const alignment = (left: string, indent: string) =>
  `<style:list-level-properties><style:list-level-label-alignment fo:margin-left="${left}" fo:text-indent="${indent}"/></style:list-level-properties>`;
const listStyle = (name: string, levels: string) => `<text:list-style style:name="${name}">${levels}</text:list-style>`;

function styles(...definitions: string[]): Map<string, ListStyle> {
  const { content, styles: stylesDoc } = documents(contentXml(''), stylesXml({ styles: definitions.join('') }));
  return readListStyles(content, stylesDoc);
}

const noList = { styleName: undefined, xmlId: undefined, continueList: undefined, continueNumbering: false };

describe('formatNumber', () => {
  it('writes decimal numbers', () => {
    expect(formatNumber(12, '1', false)).toBe('12');
    expect(formatNumber(3, 'unknown', false)).toBe('3');
  });

  it('writes letters: a to z, then aa, ab', () => {
    expect([1, 2, 26, 27, 28, 52, 53].map((n) => formatNumber(n, 'a', false))).toEqual([
      'a',
      'b',
      'z',
      'aa',
      'ab',
      'az',
      'ba',
    ]);
    expect(formatNumber(2, 'A', false)).toBe('B');
  });

  it('writes letters with letter-sync: a to z, then aa, bb', () => {
    expect([1, 26, 27, 28, 53].map((n) => formatNumber(n, 'a', true))).toEqual(['a', 'z', 'aa', 'bb', 'aaa']);
  });

  it('writes roman numerals up to 3999 and decimals beyond', () => {
    expect([1, 4, 9, 14, 40, 90, 400, 1994, 3999].map((n) => formatNumber(n, 'i', false))).toEqual([
      'i',
      'iv',
      'ix',
      'xiv',
      'xl',
      'xc',
      'cd',
      'mcmxciv',
      'mmmcmxcix',
    ]);
    expect(formatNumber(4, 'I', false)).toBe('IV');
    expect(formatNumber(4000, 'I', false)).toBe('4000');
    expect(formatNumber(0, 'i', false)).toBe('0');
  });
});

describe('readListStyles', () => {
  it('reads the levels of number and bullet styles', () => {
    const result = styles(
      listStyle(
        'L',
        number(
          1,
          'style:num-format="a" style:num-prefix="(" style:num-suffix=")" text:start-value="3" text:display-levels="2" style:num-letter-sync="true"',
          alignment('0.5in', '-0.25in'),
        ) + bullet(2, '–'),
      ),
    );
    const levels = result.get('L');
    expect(levels?.get(1)).toMatchObject({
      kind: 'number',
      format: 'a',
      prefix: '(',
      suffix: ')',
      startValue: 3,
      displayLevels: 2,
      letterSync: true,
      marginLeftMm: 12.7,
      textIndentMm: -6.35,
    });
    expect(levels?.get(2)).toMatchObject({ kind: 'bullet', bulletChar: '–' });
  });

  it('lets the list styles of content.xml replace those of styles.xml', () => {
    const { content, styles: stylesDoc } = documents(
      contentXml('', listStyle('L', bullet(1, 'B'))),
      stylesXml({ styles: listStyle('L', bullet(1, 'A')) + listStyle('Only', bullet(1, 'C')) }),
    );
    const result = readListStyles(content, stylesDoc);
    expect(result.get('L')?.get(1)?.bulletChar).toBe('B');
    expect(result.get('Only')?.get(1)?.bulletChar).toBe('C');
  });

  it('replaces the private-use bullets of symbol fonts', () => {
    const result = styles(listStyle('L', bullet(1, '\uF0B7') + bullet(2, '')));
    expect(result.get('L')?.get(1)?.bulletChar).toBe('•');
    expect(result.get('L')?.get(2)?.bulletChar).toBe('•');
  });

  it('ignores levels outside 1 to 10', () => {
    const result = styles(listStyle('L', bullet(0, 'x') + bullet(11, 'y') + bullet(1, 'z')));
    expect([...(result.get('L')?.keys() ?? [])]).toEqual([1]);
  });
});

describe('ListNumbering', () => {
  const simple = styles(
    listStyle(
      'Num',
      number(1, 'style:num-format="1" style:num-suffix="."', alignment('0.5in', '-0.25in')) +
        number(2, 'style:num-format="a" style:num-suffix=")"') +
        number(3, 'style:num-format="i" style:num-prefix="[" style:num-suffix="]"'),
    ),
    listStyle('Bul', bullet(1, '•', 'style:num-suffix="•"') + bullet(2, '◦')),
  );

  it('counts items and restarts the levels below', () => {
    const numbering = new ListNumbering(simple);
    const handle = numbering.begin({ ...noList, styleName: 'Num' });
    const markers = [
      numbering.item(handle, 0, undefined),
      numbering.item(handle, 1, undefined),
      numbering.item(handle, 1, undefined),
      numbering.item(handle, 2, undefined),
      numbering.item(handle, 0, undefined),
      numbering.item(handle, 1, undefined),
    ].map((m) => m.marker);
    expect(markers).toEqual(['1.', 'a)', 'b)', '[i]', '2.', 'a)']);
  });

  it('reports ordered, level and the indents of the level', () => {
    const numbering = new ListNumbering(simple);
    const handle = numbering.begin({ ...noList, styleName: 'Num' });
    expect(numbering.item(handle, 0, undefined)).toEqual({
      level: 0,
      marker: '1.',
      ordered: true,
      marginLeftMm: 12.7,
      textIndentMm: -6.35,
    });
  });

  it('shows only the bullet, not the suffix that repeats it', () => {
    const numbering = new ListNumbering(simple);
    const handle = numbering.begin({ ...noList, styleName: 'Bul' });
    const first = numbering.item(handle, 0, undefined);
    expect(first.marker).toBe('•');
    expect(first.ordered).toBe(false);
    expect(numbering.item(handle, 1, undefined).marker).toBe('◦');
  });

  it('lets an item start value reset its counter', () => {
    const numbering = new ListNumbering(simple);
    const handle = numbering.begin({ ...noList, styleName: 'Num' });
    numbering.item(handle, 0, undefined);
    expect(numbering.item(handle, 0, 7).marker).toBe('7.');
    expect(numbering.item(handle, 0, undefined).marker).toBe('8.');
  });

  it('starts at the level start value', () => {
    const numbering = new ListNumbering(styles(listStyle('L', number(1, 'style:num-format="1" text:start-value="5"'))));
    const handle = numbering.begin({ ...noList, styleName: 'L' });
    expect(numbering.item(handle, 0, undefined).marker).toBe('5');
    expect(numbering.item(handle, 0, undefined).marker).toBe('6');
  });

  it('shows several levels when display-levels asks for it', () => {
    const numbering = new ListNumbering(
      styles(
        listStyle(
          'L',
          number(1, 'style:num-format="1" style:num-suffix="."') +
            number(2, 'style:num-format="1" text:display-levels="2" style:num-suffix="."') +
            number(3, 'style:num-format="a" text:display-levels="3" style:num-prefix="(" style:num-suffix=")"'),
        ),
      ),
    );
    const handle = numbering.begin({ ...noList, styleName: 'L' });
    numbering.item(handle, 0, undefined);
    numbering.item(handle, 0, undefined);
    expect(numbering.item(handle, 1, undefined).marker).toBe('2.1.');
    expect(numbering.item(handle, 1, undefined).marker).toBe('2.2.');
    expect(numbering.item(handle, 2, undefined).marker).toBe('(2.2.a)');
  });

  it('gives only prefix and suffix when the format is empty', () => {
    const numbering = new ListNumbering(
      styles(listStyle('L', number(1, 'style:num-format="" style:num-prefix="Note " style:num-suffix=":"'))),
    );
    const handle = numbering.begin({ ...noList, styleName: 'L' });
    const marker = numbering.item(handle, 0, undefined);
    expect(marker.marker).toBe('Note :');
    expect(marker.ordered).toBe(false);
  });

  it('starts a new list at the start value unless it continues one', () => {
    const numbering = new ListNumbering(simple);
    const first = numbering.begin({ ...noList, styleName: 'Num' });
    numbering.item(first, 0, undefined);
    numbering.item(first, 0, undefined);

    const restarted = numbering.begin({ ...noList, styleName: 'Num' });
    expect(numbering.item(restarted, 0, undefined).marker).toBe('1.');

    const continued = numbering.begin({ ...noList, styleName: 'Num', continueNumbering: true });
    expect(numbering.item(continued, 0, undefined).marker).toBe('2.');
  });

  it('continues the previous list with the same style only', () => {
    const numbering = new ListNumbering(simple);
    const num = numbering.begin({ ...noList, styleName: 'Num' });
    numbering.item(num, 0, undefined);
    numbering.begin({ ...noList, styleName: 'Bul' });
    const continued = numbering.begin({ ...noList, styleName: 'Num', continueNumbering: true });
    expect(numbering.item(continued, 0, undefined).marker).toBe('2.');
    const other = numbering.begin({ ...noList, styleName: 'Bul', continueNumbering: true });
    expect(numbering.item(other, 0, undefined).marker).toBe('•');
  });

  it('continues the list named by continue-list', () => {
    const numbering = new ListNumbering(simple);
    const a = numbering.begin({ ...noList, styleName: 'Num', xmlId: 'list-a' });
    numbering.item(a, 0, undefined);
    const b = numbering.begin({ ...noList, styleName: 'Num', xmlId: 'list-b' });
    numbering.item(b, 0, undefined);
    numbering.item(b, 0, undefined);
    const c = numbering.begin({ ...noList, styleName: 'Num', continueList: 'list-a' });
    expect(numbering.item(c, 0, undefined).marker).toBe('2.');
    const unknown = numbering.begin({ ...noList, styleName: 'Num', continueList: 'missing' });
    expect(numbering.item(unknown, 0, undefined).marker).toBe('1.');
  });

  it('gives a list header and later paragraphs of an item no marker but keeps the indents', () => {
    const numbering = new ListNumbering(simple);
    const handle = numbering.begin({ ...noList, styleName: 'Num' });
    expect(numbering.unmarked(handle, 0)).toEqual({
      level: 0,
      marker: '',
      ordered: true,
      marginLeftMm: 12.7,
      textIndentMm: -6.35,
    });
    // The header did not use up a number.
    expect(numbering.item(handle, 0, undefined).marker).toBe('1.');
  });

  it('uses a bullet when the style is unknown or has no levels, and the deepest level beyond the last', () => {
    const numbering = new ListNumbering(simple);
    expect(numbering.item(numbering.begin({ ...noList, styleName: 'Missing' }), 0, undefined).marker).toBe('•');
    expect(numbering.item(numbering.begin(noList), 0, undefined).marker).toBe('•');
    const bullets = numbering.begin({ ...noList, styleName: 'Bul' });
    expect(numbering.item(bullets, 5, undefined).marker).toBe('◦');
  });
});

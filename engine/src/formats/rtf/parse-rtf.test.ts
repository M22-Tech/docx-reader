import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DocumentError } from '../../document-error';
import type { Block, DocumentModel, Inline, Paragraph, Table } from '../../model/document-model';
import { parseRtf } from './parse-rtf';

const fixture = (name: string) =>
  new Uint8Array(readFileSync(resolve(import.meta.dirname, '../../../../fixtures', name)));
const signal = () => new AbortController().signal;
const parse = (bytes: Uint8Array) => parseRtf(bytes, signal());
/** Bytes of a string whose characters are all below U+0100 (one byte each). */
const latin1 = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0));
/** A small document: `{\rtf1\ansi` + head + body + `}`. */
const small = (body: string, head = '') => parse(latin1(`{\\rtf1\\ansi ${head}${body}}`));

const paragraphs = (blocks: Block[]): Paragraph[] => blocks.filter((b): b is Paragraph => b.kind === 'paragraph');
const textOf = (inlines: Inline[]): string =>
  inlines.map((i) => (i.kind === 'text' ? i.text : i.kind === 'link' ? textOf(i.inlines) : '')).join('');
const texts = (model: DocumentModel): string[] => paragraphs(model.blocks).map((p) => textOf(p.inlines));
const find = (model: DocumentModel, text: string): Paragraph => {
  const found = paragraphs(model.blocks).find((p) => textOf(p.inlines).startsWith(text));
  if (!found) throw new Error(`no paragraph starting with "${text}"`);
  return found;
};
const run = (paragraph: Paragraph, text: string) => {
  const found = paragraph.inlines.find((i) => i.kind === 'text' && i.text === text);
  if (found?.kind !== 'text') throw new Error(`no run "${text}"`);
  return found;
};
const firstTable = (model: DocumentModel): Table => {
  const table = model.blocks.find((b): b is Table => b.kind === 'table');
  if (!table) throw new Error('no table');
  return table;
};
const cellTexts = (table: Table) =>
  table.rows.map((row) =>
    row.cells.map((cell) => cell.blocks.map((b) => (b.kind === 'paragraph' ? textOf(b.inlines) : b.kind)).join('|')),
  );

describe('features.rtf', () => {
  const model = parse(fixture('features.rtf'));

  it('reads the title and the page', async () => {
    const { title, page } = await model;
    expect(title).toBe('Feature fixture');
    expect(page?.widthMm).toBeCloseTo(210, 1);
    expect(page?.heightMm).toBeCloseTo(297, 1);
    expect(page?.marginLeftMm).toBeCloseTo(25.4, 1);
    expect(page?.marginRightMm).toBeCloseTo(25.4, 1);
  });

  it('gives the blocks in order, with heading levels from the style names', async () => {
    const { blocks } = await model;
    const summary = blocks.map((b) =>
      b.kind === 'paragraph' ? `${b.headingLevel ?? '-'} ${textOf(b.inlines).slice(0, 14)}` : b.kind,
    );
    expect(summary).toEqual([
      '1 Feature fixtur',
      '1 Heading one',
      '- Plain, bold, i',
      '- Large 18 pt Ge',
      '- Line oneLine t',
      '- Before tabafte',
      '- Centred paragr',
      '- Right-aligned ',
      '- Justified para',
      '- A link to exam',
      '2 Heading two',
      '- First numbered',
      '- Nested lettere',
      '- Second numbere',
      '- Bullet item',
      '- Nested bullet ',
      '3 Heading three',
      'table',
      '- ',
      '- हिन्दी पाठ: यह',
      '- ',
      '- ',
      '- ',
      'pageBreak',
      '1 Second page',
      '- This paragraph',
    ]);
  });

  it('reads the marks of the first body paragraph', async () => {
    const paragraph = find(await model, 'Plain, ');
    expect(run(paragraph, 'bold').marks).toMatchObject({ bold: true });
    expect(run(paragraph, 'italic').marks).toMatchObject({ italic: true });
    expect(run(paragraph, 'underlined').marks).toMatchObject({ underline: true });
    expect(run(paragraph, 'struck').marks).toMatchObject({ strike: true });
    expect(run(paragraph, 'red').marks).toMatchObject({ color: '#c00000' });
    expect(run(paragraph, 'highlighted').marks).toMatchObject({ highlight: '#ffff00' });
    const texts_ = paragraph.inlines.filter((i) => i.kind === 'text');
    const superscript = texts_.find((i) => i.marks?.superscript);
    const subscript = texts_.find((i) => i.marks?.subscript);
    expect(superscript?.text).toBe('2');
    expect(texts_[texts_.indexOf(superscript!) - 1]?.text.endsWith('mc')).toBe(true);
    expect(subscript?.text).toBe('2');
    expect(texts_[texts_.indexOf(subscript!) - 1]?.text.endsWith('H')).toBe(true);
    expect(texts_.filter((i) => i.marks?.bold).map((i) => i.text)).toEqual(['bold']);
    expect(texts_.filter((i) => i.marks?.italic).map((i) => i.text)).toEqual(['italic']);
    expect(texts_.filter((i) => i.marks?.underline).map((i) => i.text)).toEqual(['underlined']);
    expect(texts_.filter((i) => i.marks?.strike).map((i) => i.text)).toEqual(['struck']);
  });

  it('reads font family and size', async () => {
    const paragraph = find(await model, 'Large 18 pt');
    expect(run(paragraph, 'Large 18 pt Georgia. ').marks).toMatchObject({ fontFamily: 'Georgia', fontSizePt: 18 });
    expect(run(paragraph, 'Small 8 pt Courier New.').marks).toMatchObject({ fontFamily: 'Courier New', fontSizePt: 8 });
  });

  it('keeps a line break and a tab as inlines between the texts', async () => {
    const model_ = await model;
    expect(find(model_, 'Line one').inlines.map((i) => (i.kind === 'text' ? i.text : i.kind))).toEqual([
      'Line one',
      'lineBreak',
      'Line two after a line break',
    ]);
    expect(find(model_, 'Before tab').inlines.map((i) => (i.kind === 'text' ? i.text : i.kind))).toEqual([
      'Before tab',
      'tab',
      'after tab',
    ]);
  });

  it('reads the alignment', async () => {
    const model_ = await model;
    expect(find(model_, 'Centred').align).toBe('center');
    expect(find(model_, 'Right-aligned').align).toBe('right');
    expect(find(model_, 'Justified').align).toBe('justify');
    expect(find(model_, 'Plain, ').align).toBeUndefined();
  });

  it('reads the link, the note reference and the note', async () => {
    const model_ = await model;
    const paragraph = find(model_, 'A link to');
    const link = paragraph.inlines.find((i) => i.kind === 'link');
    expect(link).toMatchObject({ href: 'https://example.com/path?q=1' });
    expect(link?.kind === 'link' && textOf(link.inlines)).toBe('example.com');
    expect(textOf(paragraph.inlines)).toBe('A link to example.com and a footnote.');
    const ref = paragraph.inlines.find((i) => i.kind === 'noteRef');
    expect(ref).toMatchObject({ label: '1' });
    expect(model_.notes).toHaveLength(1);
    expect(model_.notes[0]?.id).toBe(ref?.kind === 'noteRef' ? ref.noteId : undefined);
    expect(model_.notes[0]?.label).toBe('1');
    const noteBlock = model_.notes[0]?.blocks[0];
    expect(noteBlock?.kind === 'paragraph' && textOf(noteBlock.inlines)).toBe(
      'This is footnote one, at the bottom of the page.',
    );
    expect(model_.notes[0]?.blocks).toHaveLength(1);
  });

  it('reads the list markers from the \\listtext groups and gives the items a left indent', async () => {
    const model_ = await model;
    const summary = [
      'First numbered item',
      'Nested lettered item',
      'Second numbered item',
      'Bullet item',
      'Nested bullet item',
    ].map((text) => {
      const p = find(model_, text);
      return [text, p.list?.marker, p.list?.level, p.list?.ordered, (p.indentLeftMm ?? 0) > 0];
    });
    expect(summary).toEqual([
      ['First numbered item', '1.', 0, true, true],
      ['Nested lettered item', 'a)', 1, true, true],
      ['Second numbered item', '2.', 0, true, true],
      ['Bullet item', '•', 0, false, true],
      ['Nested bullet item', '◦', 1, false, true],
    ]);
    expect(find(model_, 'First numbered item').firstLineMm).toBeCloseTo(-6.35, 2);
  });

  it('reads the table with its spans, merged cell and column widths', async () => {
    const table = firstTable(await model);
    expect(table.rows).toHaveLength(4);
    expect(cellTexts(table)).toEqual([
      ['Name', 'Role', 'City'],
      ['Asha', 'Engineer', 'Delhi'],
      ['Ravi', 'Designer'],
      ['Spans two columns', 'Pune'],
    ]);
    expect(table.rows[1]?.cells[2]?.rowSpan).toBe(2);
    expect(table.rows[2]?.cells).toHaveLength(2);
    expect(table.rows[3]?.cells[0]?.colSpan).toBe(2);
    expect(table.columnWidthsMm).toHaveLength(3);
    for (const width of table.columnWidthsMm ?? []) expect(width).toBeCloseTo(53, 0);
  });

  it('keeps the Hindi and Bengali text unchanged', async () => {
    expect(textOf(find(await model, 'हिन्दी').inlines)).toBe(
      'हिन्दी पाठ: यह एक परीक्षण अनुच्छेद है। বাংলা: এটি একটি পরীক্ষা।',
    );
  });

  it('reads both pictures with their sizes and bytes', async () => {
    const images = paragraphs((await model).blocks).flatMap((p) => p.inlines.filter((i) => i.kind === 'image'));
    expect(images).toHaveLength(2);
    const [png, jpeg] = images;
    expect(png?.widthPx).toBeCloseTo(240, 0);
    expect(png?.heightPx).toBeCloseTo(120, 0);
    expect(png?.src?.mime).toBe('image/png');
    expect([...(png?.src?.data.subarray(0, 8) ?? [])]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(jpeg?.widthPx).toBeCloseTo(320, 0);
    expect(jpeg?.heightPx).toBeCloseTo(200, 0);
    expect(jpeg?.src?.mime).toBe('image/jpeg');
    expect([...(jpeg?.src?.data.subarray(0, 3) ?? [])]).toEqual([0xff, 0xd8, 0xff]);
  });

  it('puts the page break right before "Second page"', async () => {
    const { blocks } = await model;
    const index = blocks.findIndex((b) => b.kind === 'pageBreak');
    expect(blocks.filter((b) => b.kind === 'pageBreak')).toHaveLength(1);
    const next = blocks[index + 1];
    expect(next?.kind === 'paragraph' && textOf(next.inlines)).toBe('Second page');
  });

  it('leaves out the header, the tables of fonts, colours and styles, the info and the star destinations', async () => {
    const all = JSON.stringify(await model);
    for (const word of [
      'Fixture header text',
      'Times New Roman',
      'Liberation',
      'Heading 1',
      'Un-named',
      'Hyperlink',
      'Page ',
    ]) {
      expect(all, word).not.toContain(word);
    }
    expect(all).not.toContain('HYPERLINK');
    expect(all).not.toContain('wzDescription');
  });
});

describe('minimal files', () => {
  it('reads minimal.rtf as one paragraph', async () => {
    const model = await parse(fixture('minimal.rtf'));
    expect(texts(model)).toEqual(['Hello, reader.']);
    expect(model.blocks).toHaveLength(1);
    expect(model.notes).toEqual([]);
  });

  it('reads rtf-named.doc (an RTF file with a .doc name) the same way', async () => {
    expect(texts(await parse(fixture('rtf-named.doc')))).toEqual(['Hello, reader.']);
  });
});

describe('invalid input', () => {
  it('rejects a file that does not start with {\\rtf as corrupt', async () => {
    for (const text of ['hello', '', '{\\rt', '{rtf1 text}', '\\rtf1 text}']) {
      const error: unknown = await parse(latin1(text)).catch((e: unknown) => e);
      expect(error, text).toBeInstanceOf(DocumentError);
      expect(error, text).toMatchObject({ code: 'corrupt' });
    }
  });

  it('accepts white space and a byte-order mark before {\\rtf', async () => {
    expect(texts(await parse(latin1('\r\n  {\\rtf1 Hi\\par}')))).toEqual(['Hi']);
    expect(texts(await parse(Uint8Array.from([0xef, 0xbb, 0xbf, ...latin1('{\\rtf1 Hi\\par}')])))).toEqual(['Hi']);
  });

  it('rejects a file whose groups end before any text as corrupt', async () => {
    for (const text of ['{\\rtf1\\ansi', '{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}', '{\\rtf1{\\info{\\title Cut']) {
      await expect(parse(latin1(text)), text).rejects.toMatchObject({ code: 'corrupt' });
    }
  });

  it('keeps what was read when groups are left open after the text', async () => {
    const model = await parse(latin1('{\\rtf1\\ansi Before\\par {\\b Bold and cut'));
    expect(texts(model)).toEqual(['Before', 'Bold and cut']);
    expect(find(model, 'Bold and cut').inlines[0]).toMatchObject({ marks: { bold: true } });
  });

  it('gives an empty document for {\\rtf1} and ignores extra closing braces and trailing bytes', async () => {
    expect((await parse(latin1('{\\rtf1}'))).blocks).toEqual([]);
    expect(texts(await parse(latin1('{\\rtf1 A\\par}}}junk{')))).toEqual(['A']);
  });

  it('rejects groups nested deeper than any real document', async () => {
    await expect(parse(latin1(`{\\rtf1 ${'{'.repeat(5000)}x`))).rejects.toMatchObject({ code: 'corrupt' });
  });

  it('stops when the signal is aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(parseRtf(fixture('minimal.rtf'), controller.signal)).rejects.toThrow();
  });
});

describe('text and code pages', () => {
  it("decodes \\'e9 in code page 1252", async () => {
    expect(texts(await small("caf\\'e9\\par"))).toEqual(['café']);
  });

  it('decodes Cyrillic with \\ansicpg1251', async () => {
    const model = await parse(latin1("{\\rtf1\\ansi\\ansicpg1251 \\'cf\\'f0\\'e8\\'e2\\'e5\\'f2\\par}"));
    expect(texts(model)).toEqual(['Привет']);
  });

  it('decodes raw text bytes in the document code page too', async () => {
    const bytes = Uint8Array.from([...latin1('{\\rtf1\\ansi\\ansicpg1251 '), 0xcf, 0xf0, ...latin1('\\par}')]);
    expect(texts(await parse(bytes))).toEqual(['Пр']);
  });

  it('uses the charset of the current font for its bytes', async () => {
    const head = '{\\fonttbl{\\f0\\fcharset0 Arial;}{\\f1\\fcharset204 Arial;}}';
    const model = await small("\\f0 caf\\'e9 \\f1\\'cf\\'f0\\par", head);
    expect(texts(model)).toEqual(['café Пр']);
  });

  it('decodes double-byte bytes together (Shift-JIS)', async () => {
    const head = '{\\fonttbl{\\f0\\fcharset128 MS Mincho;}}';
    expect(texts(await small("\\f0 \\'82\\'a0\\'82\\'a2\\par", head))).toEqual(['あい']);
  });

  it('reads a negative \\u as a code point plus 65536 and skips the fallback character', async () => {
    expect(texts(await small('a\\u-3913?b\\par'))).toEqual(['ab']);
    expect(texts(await small('\\u8364?x\\par'))).toEqual(['€x']);
  });

  it("skips as many fallback characters as \\uc says, counting \\'hh as one", async () => {
    expect(texts(await small('\\uc2\\u8364??x\\par'))).toEqual(['€x']);
    expect(texts(await small("\\uc2\\u8364\\'80\\'80x\\par"))).toEqual(['€x']);
    expect(texts(await small('\\uc0\\u8364?x\\par'))).toEqual(['€?x']);
    expect(texts(await small('{\\uc2\\u8364??}\\u8364?x\\par'))).toEqual(['€€x']);
  });

  it('joins surrogate pairs written as two \\u escapes', async () => {
    expect(texts(await small('\\u-10179?\\u-8704?\\par'))).toEqual(['😀']);
  });

  it('reads the escaped characters and special characters', async () => {
    expect(texts(await small('a\\\\b\\{c\\}d\\~e\\emdash\\endash\\bullet\\lquote\\rdblquote\\par'))).toEqual([
      'a\\b{c}d e—–•‘”',
    ]);
  });

  it('skips \\binN data as raw bytes, even when it holds braces and backslashes', async () => {
    const bytes = Uint8Array.from([
      ...latin1('{\\rtf1 Before\\bin6 '),
      0x7b,
      0x5c,
      0x70,
      0x61,
      0x72,
      0x7d,
      ...latin1('After\\par}'),
    ]);
    expect(texts(await parse(bytes))).toEqual(['BeforeAfter']);
  });

  it('keeps white space inside text and drops line ends', async () => {
    expect(texts(await small('one two\r\nthree  four\\par'))).toEqual(['one twothree  four']);
  });
});

describe('formatting state', () => {
  it('restores formatting when a group closes', async () => {
    const paragraph = find(await small('plain {\\b bold {\\i both}} after\\par'), 'plain');
    expect(
      paragraph.inlines.map((i) =>
        i.kind === 'text' ? [i.text, i.marks?.bold ?? false, i.marks?.italic ?? false] : null,
      ),
    ).toEqual([
      ['plain ', false, false],
      ['bold ', true, false],
      ['both', true, true],
      [' after', false, false],
    ]);
  });

  it('turns a toggle off with a 0 parameter', async () => {
    const paragraph = find(await small('\\b bold\\b0  not\\par'), 'bold');
    expect(run(paragraph, 'bold').marks?.bold).toBe(true);
    expect(run(paragraph, ' not').marks?.bold).toBeUndefined();
  });

  it('resets the character formatting with \\plain', async () => {
    const paragraph = find(await small('\\b\\i\\fs40 big\\plain  small\\par'), 'big');
    expect(run(paragraph, 'big').marks).toMatchObject({ bold: true, italic: true, fontSizePt: 20 });
    expect(run(paragraph, ' small').marks?.bold).toBeUndefined();
    expect(run(paragraph, ' small').marks?.fontSizePt).toBe(12);
  });

  it('resets the alignment and indents with \\pard', async () => {
    const model = await small('\\qc\\li720 centred\\par plain\\par \\pard\\qr right\\par\\pard none\\par');
    expect(paragraphs(model.blocks).map((p) => [textOf(p.inlines), p.align, p.indentLeftMm])).toEqual([
      ['centred', 'center', 12.7],
      ['plain', 'center', 12.7],
      ['right', 'right', undefined],
      ['none', undefined, undefined],
    ]);
  });

  it('reads spacing, line height and indents in the model units', async () => {
    const p = find(await small('\\li1440\\ri720\\fi-360\\sb240\\sa120\\sl360\\slmult1 text\\par'), 'text');
    expect(p).toMatchObject({
      indentLeftMm: 25.4,
      indentRightMm: 12.7,
      firstLineMm: -6.35,
      spaceBeforePt: 12,
      spaceAfterPt: 6,
      lineHeight: 1.5,
    });
  });

  it('prefers \\lin and \\rin to \\li and \\ri', async () => {
    const p = find(await small('\\li0\\lin1440\\ri0\\rin720 text\\par'), 'text');
    expect(p).toMatchObject({ indentLeftMm: 25.4, indentRightMm: 12.7 });
  });

  it('ignores an exact line height it cannot express as a multiple', async () => {
    expect(find(await small('\\sl-300\\slmult0 text\\par'), 'text').lineHeight).toBeUndefined();
    expect(find(await small('\\sl240\\slmult1 text\\par'), 'text').lineHeight).toBeUndefined();
  });

  it('reads colours, highlight and shading from the colour table, and ignores auto', async () => {
    const head = '{\\colortbl;\\red255\\green0\\blue0;\\red0\\green0\\blue255;}';
    const paragraph = find(
      await small('\\cf1 red\\cf0  auto\\highlight2  hi\\highlight0\\chcbpat1  shade\\par', head),
      'red',
    );
    expect(run(paragraph, 'red').marks).toMatchObject({ color: '#ff0000' });
    expect(run(paragraph, ' auto').marks?.color).toBeUndefined();
    expect(run(paragraph, ' hi').marks).toMatchObject({ highlight: '#0000ff' });
    expect(run(paragraph, ' shade').marks).toMatchObject({ highlight: '#ff0000' });
  });

  it('reads every underline style except \\ulnone and the underline colour', async () => {
    const paragraph = find(await small('\\uldb a\\ulnone  b\\ul c\\ul0  d\\ulc1 e\\par'), 'a');
    const underlined = paragraph.inlines
      .filter((i) => i.kind === 'text' && i.marks?.underline)
      .map((i) => (i.kind === 'text' ? i.text : ''));
    expect(underlined).toEqual(['a', 'c']);
  });

  it('reads strike, double strike and the super and subscript words', async () => {
    const paragraph = find(
      await small(
        '\\strike a\\strike0  - \\striked1 b\\striked0  - \\super c\\nosupersub  - \\sub d\\nosupersub  - e\\par',
      ),
      'a',
    );
    const marks = (text: string) => run(paragraph, text).marks;
    expect(marks('a')?.strike).toBe(true);
    expect(marks('b')?.strike).toBe(true);
    expect(marks('c')?.superscript).toBe(true);
    expect(marks('d')?.subscript).toBe(true);
    expect(marks(' - e')?.subscript).toBeUndefined();
  });

  it('drops hidden and deleted text', async () => {
    expect(texts(await small('shown \\v hidden\\v0 back \\deleted gone\\deleted0 end\\par'))).toEqual([
      'shown back end',
    ]);
  });

  it('uses the default font for text without \\f, and the font size in half-points', async () => {
    const head = '\\deff1{\\fonttbl{\\f0 Times;}{\\f1 Verdana;}}';
    const paragraph = find(await small('plain \\f0\\fs22 other\\par', head), 'plain');
    expect(run(paragraph, 'plain ').marks).toMatchObject({ fontFamily: 'Verdana', fontSizePt: 12 });
    expect(run(paragraph, 'other').marks).toEqual({ fontFamily: 'Times' });
  });
});

describe('styles', () => {
  const sheet = (...entries: string[]) => `{\\stylesheet{\\s0 Normal;}${entries.join('')}}`;

  it('takes a heading level from the style name, through \\sbasedon', async () => {
    const head = sheet(
      '{\\s1\\sbasedon0 Heading 2;}',
      '{\\s2\\sbasedon1 My heading;}',
      '{\\s3 Title;}',
      '{\\s4 Heading;}',
    );
    const model = await small('\\s1 a\\par \\pard\\s2 b\\par \\pard\\s3 c\\par \\pard\\s4 d\\par \\pard e\\par', head);
    expect(paragraphs(model.blocks).map((p) => p.headingLevel)).toEqual([2, 2, 1, undefined, undefined]);
  });

  it('prefers \\outlinelevel (0-based) to the style name and maps levels 7 to 9 to 6', async () => {
    const head = sheet('{\\s1 Heading 1;}');
    const model = await small(
      '\\s1\\outlinelevel2 a\\par \\pard\\outlinelevel8 b\\par \\pard\\outlinelevel9 c\\par',
      head,
    );
    expect(paragraphs(model.blocks).map((p) => p.headingLevel)).toEqual([3, 6, undefined]);
  });

  it('applies the properties of the paragraph style and lets direct formatting win', async () => {
    const head = sheet('{\\s1\\qc\\sb240\\b\\fs40 Big;}');
    const model = await small('\\s1 styled\\par \\pard\\s1\\ql\\b0 direct\\par', head);
    const [styled, direct] = paragraphs(model.blocks);
    expect(styled).toMatchObject({ align: 'center', spaceBeforePt: 12 });
    expect(run(styled!, 'styled').marks).toMatchObject({ bold: true, fontSizePt: 20 });
    expect(direct?.align).toBeUndefined();
    expect(run(direct!, 'direct').marks?.bold).toBeUndefined();
  });

  it('applies a character style with \\cs, also from a starred stylesheet entry', async () => {
    const head = sheet('{\\*\\cs5\\i\\cf1 Emphasis;}', '{\\cs6\\b Strong;}').replace(
      '{\\stylesheet',
      '{\\colortbl;\\red1\\green2\\blue3;}{\\stylesheet',
    );
    const paragraph = find(await small('a \\cs5 b\\cs0  c \\cs6 d\\par', head), 'a ');
    expect(run(paragraph, 'b').marks).toMatchObject({ italic: true, color: '#010203' });
    expect(run(paragraph, 'd').marks).toMatchObject({ bold: true });
    expect(paragraph.inlines.map((i) => (i.kind === 'text' ? i.text : ''))).toEqual(['a ', 'b', ' c ', 'd']);
  });

  it('survives a style that is based on itself', async () => {
    const head = sheet('{\\s1\\sbasedon1 Heading 1;}', '{\\s2\\sbasedon3 A;}', '{\\s3\\sbasedon2 B;}');
    const model = await small('\\s1 a\\par \\pard\\s2 b\\par', head);
    expect(paragraphs(model.blocks).map((p) => p.headingLevel)).toEqual([1, undefined]);
  });
});

describe('destinations', () => {
  it('skips an unknown {\\*\\foo ...} destination, with groups inside it', async () => {
    expect(texts(await small('A{\\*\\foo hidden {\\b more} text}B\\par'))).toEqual(['AB']);
  });

  it('skips the destinations the design lists, including comments and index entries', async () => {
    const body =
      'A{\\header Head}{\\footerr Foot}{\\annotation Note}{\\xe Entry}{\\tc Toc}{\\pgdsctbl x}{\\shp{\\*\\shpinst y}}{\\generator Gen}{\\themedata t}{\\latentstyles l}B\\par';
    expect(texts(await small(body))).toEqual(['AB']);
  });

  it('skips the list tables', async () => {
    expect(
      texts(
        await small(
          '{\\*\\listtable{\\list\\listid1{\\listlevel text}}}{\\listoverridetable{\\listoverride\\listid1}}x\\par',
        ),
      ),
    ).toEqual(['x']);
  });

  it('reads only the title from \\info', async () => {
    const model = await small(
      'Text\\par',
      '{\\info{\\title My Title}{\\author Someone}{\\subject Other}{\\creatim\\yr2026}}',
    );
    expect(model.title).toBe('My Title');
    expect(texts(model)).toEqual(['Text']);
  });

  it('gives no title when \\title is empty or missing', async () => {
    expect((await small('x\\par', '{\\info{\\title }}')).title).toBeUndefined();
    expect((await small('x\\par')).title).toBeUndefined();
  });

  it('uses \\shppict and skips \\nonshppict', async () => {
    const pict = (hex: string) => `{\\pict\\pngblip\\picwgoal300\\pichgoal300 ${hex}}`;
    const model = await small(`{\\*\\shppict${pict('8950')}}{\\nonshppict${pict('0000')}}\\par`);
    const images = paragraphs(model.blocks).flatMap((p) => p.inlines.filter((i) => i.kind === 'image'));
    expect(images).toHaveLength(1);
    expect([...(images[0]?.src?.data ?? [])]).toEqual([0x89, 0x50]);
  });

  it('uses only the \\result of an \\object', async () => {
    const pict = '{\\pict\\jpegblip\\picwgoal150\\pichgoal150 ffd8}';
    const model = await small(`{\\object\\objemb{\\*\\objdata 0102030405}{\\result ${pict}}}after\\par`);
    const p = paragraphs(model.blocks)[0]!;
    expect(p.inlines.map((i) => i.kind)).toEqual(['image', 'text']);
    expect(textOf(p.inlines)).toBe('after');
  });

  it('shows a placeholder for a metafile picture and reads \\bin picture data', async () => {
    const bytes = Uint8Array.from([
      ...latin1(
        '{\\rtf1 {\\pict\\emfblip\\picwgoal300\\pichgoal150 0100}{\\pict\\pngblip\\picwgoal300\\pichgoal150\\bin3 ',
      ),
      0x89,
      0x50,
      0x4e,
      ...latin1('}\\par}'),
    ]);
    const images = paragraphs((await parse(bytes)).blocks).flatMap((p) => p.inlines.filter((i) => i.kind === 'image'));
    expect(images).toHaveLength(2);
    expect(images[0]).toEqual({ kind: 'image', widthPx: 20, heightPx: 10 });
    expect([...(images[1]?.src?.data ?? [])]).toEqual([0x89, 0x50, 0x4e]);
  });

  it('turns \\bkmkstart into an anchor', async () => {
    const paragraph = find(await small('a{\\*\\bkmkstart chapter1}b{\\*\\bkmkend chapter1}\\par'), 'ab');
    expect(
      paragraph.inlines.map((i) => (i.kind === 'anchor' ? `#${i.id}` : i.kind === 'text' ? i.text : i.kind)),
    ).toEqual(['a', '#chapter1', 'b']);
  });
});

describe('fields', () => {
  it('turns a HYPERLINK field into a link around the result', async () => {
    const model = await small(
      'see {\\field{\\*\\fldinst HYPERLINK "https://example.com/a"}{\\fldrslt {\\b the site}}} now\\par',
    );
    const paragraph = paragraphs(model.blocks)[0]!;
    expect(paragraph.inlines.map((i) => i.kind)).toEqual(['text', 'link', 'text']);
    const link = paragraph.inlines[1];
    expect(link).toMatchObject({ kind: 'link', href: 'https://example.com/a' });
    expect(link?.kind === 'link' && link.inlines).toMatchObject([{ text: 'the site', marks: { bold: true } }]);
  });

  it('reads the bookmark switch as an internal link', async () => {
    const model = await small('{\\field{\\*\\fldinst HYPERLINK \\\\l "top"}{\\fldrslt Up}}\\par');
    expect(paragraphs(model.blocks)[0]?.inlines[0]).toMatchObject({ kind: 'link', href: '#top' });
  });

  it('shows the result of any other field as plain text', async () => {
    const model = await small('Page {\\field{\\*\\fldinst PAGE}{\\fldrslt 3}} of text\\par');
    expect(texts(model)).toEqual(['Page 3 of text']);
    expect(paragraphs(model.blocks)[0]?.inlines.map((i) => i.kind)).toEqual(['text']);
  });

  it('shows nothing for a field without \\fldrslt', async () => {
    const model = await small('a{\\field{\\*\\fldinst HYPERLINK "https://example.com"}}b\\par');
    expect(texts(model)).toEqual(['ab']);
  });

  it('keeps nested fields apart', async () => {
    const model = await small(
      '{\\field{\\*\\fldinst HYPERLINK "https://a.example"}{\\fldrslt one {\\field{\\*\\fldinst PAGE}{\\fldrslt 2}} two}}\\par',
    );
    const link = paragraphs(model.blocks)[0]?.inlines[0];
    expect(link).toMatchObject({ kind: 'link', href: 'https://a.example' });
    expect(link?.kind === 'link' && textOf(link.inlines)).toBe('one 2 two');
  });
});

describe('footnotes', () => {
  it('numbers the notes in order and drops the \\chftn inside the note', async () => {
    const model = await small(
      'One{\\super \\chftn{\\*\\footnote \\chftn  First note}} two{\\super \\chftn{\\*\\footnote \\chftn  Second note}}.\\par',
    );
    expect(
      model.notes.map((n) => [n.label, n.blocks.map((b) => (b.kind === 'paragraph' ? textOf(b.inlines) : ''))]),
    ).toEqual([
      ['1', ['First note']],
      ['2', ['Second note']],
    ]);
    const refs = paragraphs(model.blocks)[0]!.inlines.filter((i) => i.kind === 'noteRef');
    expect(refs.map((r) => [r.noteId, r.label])).toEqual(model.notes.map((n) => [n.id, n.label]));
    expect(textOf(paragraphs(model.blocks)[0]!.inlines)).toBe('One two.');
  });

  it('keeps the paragraphs of a note apart from the body and drops a trailing empty one', async () => {
    const model = await small('Body{\\footnote \\pard Line one\\par Line two\\par}more\\par next\\par');
    expect(texts(model)).toEqual(['Bodymore', 'next']);
    expect(model.notes[0]?.blocks.map((b) => (b.kind === 'paragraph' ? textOf(b.inlines) : ''))).toEqual([
      'Line one',
      'Line two',
    ]);
  });

  it('treats \\ftnalt notes like the others', async () => {
    const model = await small('a{\\*\\footnote\\ftnalt \\chftn  end}\\par');
    expect(model.notes).toHaveLength(1);
  });
});

describe('page breaks and paragraph ends', () => {
  it('puts a page break before a paragraph with \\pagebb, and only for that paragraph', async () => {
    const model = await small('a\\par \\pard\\pagebb b\\par \\pard c\\par');
    expect(model.blocks.map((b) => (b.kind === 'paragraph' ? textOf(b.inlines) : b.kind))).toEqual([
      'a',
      'pageBreak',
      'b',
      'c',
    ]);
  });

  it('splits at \\page and does not add an empty paragraph for the \\par after it', async () => {
    const model = await small('before\\page after\\par');
    expect(model.blocks.map((b) => (b.kind === 'paragraph' ? textOf(b.inlines) : b.kind))).toEqual([
      'before',
      'pageBreak',
      'after',
    ]);
    const model2 = await small('x\\par\\page\\par y\\par');
    expect(model2.blocks.map((b) => (b.kind === 'paragraph' ? textOf(b.inlines) : b.kind))).toEqual([
      'x',
      'pageBreak',
      'y',
    ]);
  });

  it('ends a paragraph at \\sect only when it has content', async () => {
    const model = await small('a\\sect\\sect b\\sect\\sect');
    expect(texts(model)).toEqual(['a', 'b']);
  });

  it('keeps empty paragraphs from \\par and a last paragraph without \\par', async () => {
    expect(texts(await small('a\\par\\par b'))).toEqual(['a', '', 'b']);
  });
});

describe('tables', () => {
  const row = (cells: string[], def: string) =>
    `\\trowd${def}${cells.map((c) => `\\pard\\intbl ${c}\\cell`).join('')}\\row`;

  it('reads a table and closes it at the first paragraph outside it', async () => {
    const def = '\\cellx1000\\cellx2000';
    const model = await small(`before\\par ${row(['a', 'b'], def)}${row(['c', 'd'], def)}\\pard after\\par`);
    expect(model.blocks.map((b) => b.kind)).toEqual(['paragraph', 'table', 'paragraph']);
    expect(cellTexts(firstTable(model))).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('puts several paragraphs in one cell', async () => {
    const model = await small('\\trowd\\cellx1000\\pard\\intbl one\\par two\\cell\\row');
    expect(cellTexts(firstTable(model))).toEqual([['one|two']]);
  });

  it('gives an empty cell one empty paragraph', async () => {
    const model = await small(row(['', 'x'], '\\cellx1000\\cellx2000'));
    expect(firstTable(model).rows[0]?.cells[0]?.blocks).toEqual([{ kind: 'paragraph', inlines: [] }]);
  });

  it('uses the row definition read last before \\row', async () => {
    const first = '\\trowd\\cellx1000\\pard\\intbl a\\cell\\pard\\intbl b\\cell';
    const model = await small(`${first}\\trowd\\cellx1000\\cellx3000\\row`);
    const table = firstTable(model);
    expect(table.columnWidthsMm).toHaveLength(2);
    expect(cellTexts(table)).toEqual([['a', 'b']]);
  });

  it('honours \\clmgf and \\clmrg for a horizontal merge', async () => {
    const def = '\\clmgf\\cellx1000\\clmrg\\cellx2000\\cellx3000';
    const model = await small(`\\trowd${def}\\pard\\intbl a\\cell\\pard\\intbl \\cell\\pard\\intbl c\\cell\\row`);
    const table = firstTable(model);
    expect(cellTexts(table)).toEqual([['a', 'c']]);
    expect(table.rows[0]?.cells[0]?.colSpan).toBe(2);
  });

  it('honours \\clvmgf and \\clvmrg for a vertical merge', async () => {
    const model = await small(
      `\\trowd\\clvmgf\\cellx1000\\cellx2000\\pard\\intbl tall\\cell\\pard\\intbl b\\cell\\row` +
        `\\trowd\\clvmrg\\cellx1000\\cellx2000\\pard\\intbl \\cell\\pard\\intbl d\\cell\\row`,
    );
    const table = firstTable(model);
    expect(cellTexts(table)).toEqual([['tall', 'b'], ['d']]);
    expect(table.rows[0]?.cells[0]?.rowSpan).toBe(2);
  });

  it('reads \\trhdr as a header row and \\clcbpat as the cell background', async () => {
    const model = await small(
      `{\\colortbl;\\red255\\green255\\blue0;}\\trowd\\trhdr\\clcbpat1\\cellx1000\\pard\\intbl h\\cell\\row\\trowd\\cellx1000\\pard\\intbl d\\cell\\row`,
    );
    const table = firstTable(model);
    expect(table.rows.map((r) => r.header ?? false)).toEqual([true, false]);
    expect(table.rows[0]?.cells[0]?.background).toBe('#ffff00');
  });

  it('builds a nested table inside a cell', async () => {
    const outer = '\\trowd\\cellx6000\\pard\\intbl\\itap1 outer text\\par';
    const inner =
      '\\pard\\intbl\\itap2 inner\\nestcell{\\*\\nesttableprops\\trowd\\cellx1000\\cellx2000\\nestrow}{\\nonesttables\\par}';
    const innerFull = inner.replace('inner\\nestcell', 'in1\\nestcell\\pard\\intbl\\itap2 in2\\nestcell');
    const model = await small(`${outer}${innerFull}\\pard\\intbl\\itap1 \\cell\\row`);
    const table = firstTable(model);
    const cell = table.rows[0]?.cells[0];
    expect(cell?.blocks.map((b) => b.kind)).toEqual(['paragraph', 'table']);
    const nested = cell?.blocks[1] as Table;
    expect(cellTexts(nested)).toEqual([['in1', 'in2']]);
    expect(nested.columnWidthsMm).toHaveLength(2);
    expect(JSON.stringify(model)).not.toContain('nonesttables');
  });
});

describe('lists', () => {
  it('reads a WordPad-style file: no stylesheet, bullets and numbers from \\pntext', async () => {
    const head = '{\\fonttbl{\\f0\\fnil\\fcharset0 Arial;}{\\f1\\fnil\\fcharset2 Symbol;}}';
    const body =
      "{\\pntext\\f1\\'B7\\tab}{\\*\\pn\\pnlvlblt\\pnf1\\pnindent0{\\pntxtb\\'B7}}\\fi-720\\li720 First bullet\\par " +
      "{\\pntext\\f1\\'B7\\tab}{\\*\\pn\\pnlvlblt\\pnf1\\pnindent0{\\pntxtb\\'B7}}\\fi-720\\li720 Second bullet\\par " +
      '\\pard{\\pntext\\f0 1.\\tab}{\\*\\pn\\pnlvlbody\\pnf0\\pnindent0\\pnstart1\\pndec{\\pntxta.}}\\fi-720\\li720 First number\\par ' +
      '\\pard{\\pntext\\f0 a)\\tab}{\\*\\pn\\pnlvl2\\pnf0\\pnstart1\\pnlcltr{\\pntxta)}}\\fi-720\\li1440 Nested\\par ' +
      '\\pard Plain\\par';
    const model = await small(body, head);
    expect(
      paragraphs(model.blocks).map((p) => [textOf(p.inlines), p.list?.marker, p.list?.level, p.list?.ordered]),
    ).toEqual([
      ['First bullet', '•', 0, false],
      ['Second bullet', '•', 0, false],
      ['First number', '1.', 0, true],
      ['Nested', 'a)', 1, true],
      ['Plain', undefined, undefined, undefined],
    ]);
    expect(model.blocks.every((b) => b.kind === 'paragraph' && !JSON.stringify(b).includes('\\\\'))).toBe(true);
  });

  it('maps a Wingdings square and an arrow bullet', async () => {
    const head = '{\\fonttbl{\\f0\\fcharset2 Wingdings;}}';
    const model = await small("{\\listtext\\f0\\'a7\\tab}one\\par {\\listtext\\f0\\'d8\\tab}two\\par", head);
    expect(paragraphs(model.blocks).map((p) => p.list?.marker)).toEqual(['▪', '•']);
  });

  it('takes the level from \\ilvl', async () => {
    const model = await small('{\\listtext 1.\\tab}\\ilvl2 deep\\par');
    expect(paragraphs(model.blocks)[0]?.list).toEqual({ level: 2, marker: '1.', ordered: true });
  });

  it('gives a paragraph with an empty \\listtext no list', async () => {
    const model = await small('{\\listtext \\tab}plain\\par');
    expect(paragraphs(model.blocks)[0]?.list).toBeUndefined();
  });
});

describe('size', () => {
  it('parses a 2 MB document in well under a second', async () => {
    const paragraph =
      "\\pard\\plain\\s0\\qj\\f0\\fs22 {\\b Bold words} and {\\i italic words} with \\'e9 and \\u8364? in a long line of ordinary text.\\par\r\n";
    const count = Math.ceil((2 * 1024 * 1024) / paragraph.length);
    const bytes = latin1(`{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}${paragraph.repeat(count)}}`);
    expect(bytes.length).toBeGreaterThan(2 * 1024 * 1024);
    const start = performance.now();
    const model = await parse(bytes);
    const elapsed = performance.now() - start;
    expect(model.blocks).toHaveLength(count);
    expect(elapsed).toBeLessThan(1000);
  });

  it('parses a 2 MB picture quickly', async () => {
    const hex = 'ab'.repeat(1024 * 1024);
    const model = await small(`{\\pict\\pngblip\\picwgoal1500\\pichgoal1500 ${hex}}\\par`);
    const image = paragraphs(model.blocks)[0]?.inlines[0];
    expect(image?.kind === 'image' && image.src?.data.length).toBe(1024 * 1024);
  });
});

// Private documents; the folder may be empty. Nothing from them is printed.
const SAMPLES = resolve(import.meta.dirname, '../../../../samples');
const sampleFiles = existsSync(SAMPLES)
  ? readdirSync(SAMPLES).filter((name) => name.toLowerCase().endsWith('.rtf'))
  : [];

describe.skipIf(sampleFiles.length === 0)('.rtf files in samples/', () => {
  sampleFiles.forEach((name, index) => {
    it(`sample ${index + 1} parses into at least one block`, async () => {
      const model = await parse(new Uint8Array(readFileSync(resolve(SAMPLES, name))));
      expect(model.blocks.length).toBeGreaterThan(0);
    });
  });
});

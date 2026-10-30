import { describe, expect, it } from 'vitest';
import { DocumentError } from '../../document-error';
import type { Block, DocumentModel, Inline, Paragraph, Table } from '../../model/document-model';
import {
  buildOdt,
  contentXml,
  fixture,
  JPEG_BYTES,
  manifestXml,
  metaXml,
  PNG_BYTES,
  stylesXml,
} from './odt-test-helpers';
import { parseOdt } from './parse-odt';

const signal = () => new AbortController().signal;
const parse = (bytes: Uint8Array) => parseOdt(bytes, signal());

const paragraphs = (blocks: Block[]): Paragraph[] => blocks.filter((b): b is Paragraph => b.kind === 'paragraph');
const textOf = (inlines: Inline[]): string =>
  inlines.map((i) => (i.kind === 'text' ? i.text : i.kind === 'link' ? textOf(i.inlines) : '')).join('');
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

describe('features.odt', () => {
  const model = parse(fixture('features.odt'));

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
    expect(run(paragraph, '2')).toBeDefined();
    const texts = paragraph.inlines.filter((i) => i.kind === 'text');
    const superscript = texts.find((i) => i.marks?.superscript);
    const subscript = texts.find((i) => i.marks?.subscript);
    expect(superscript?.text).toBe('2');
    expect(texts[texts.indexOf(superscript!) - 1]?.text.endsWith('mc')).toBe(true);
    expect(subscript?.text).toBe('2');
    expect(texts[texts.indexOf(subscript!) - 1]?.text.endsWith('H')).toBe(true);
    // Only the words named carry the mark.
    expect(texts.filter((i) => i.marks?.bold).map((i) => i.text)).toEqual(['bold']);
    expect(texts.filter((i) => i.marks?.italic).map((i) => i.text)).toEqual(['italic']);
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
    const ref = paragraph.inlines.find((i) => i.kind === 'noteRef');
    expect(ref).toMatchObject({ label: '1' });
    expect(model_.notes).toHaveLength(1);
    expect(model_.notes[0]?.id).toBe(ref?.kind === 'noteRef' ? ref.noteId : undefined);
    const noteBlock = model_.notes[0]?.blocks[0];
    expect(noteBlock?.kind === 'paragraph' && textOf(noteBlock.inlines)).toBe(
      'This is footnote one, at the bottom of the page.',
    );
  });

  it('computes the list markers and gives the items a left indent', async () => {
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
  });

  it('reads the table with its header row, spans and column widths', async () => {
    const { blocks } = await model;
    const table = blocks.find((b): b is Table => b.kind === 'table');
    if (!table) throw new Error('no table');
    const rows = table.rows.map((row) => row.cells.map((cell) => textOf((cell.blocks[0] as Paragraph).inlines)));
    expect(rows).toEqual([
      ['Name', 'Role', 'City'],
      ['Asha', 'Engineer', 'Delhi'],
      ['Ravi', 'Designer'],
      ['Spans two columns', 'Pune'],
    ]);
    expect(table.rows.map((r) => r.header ?? false)).toEqual([true, false, false, false]);
    expect(table.rows[1]?.cells[2]?.rowSpan).toBe(2);
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
});

describe('minimal.odt', () => {
  it('is one paragraph', async () => {
    const model = await parse(fixture('minimal.odt'));
    expect(model.blocks).toHaveLength(1);
    expect(model.blocks[0]?.kind === 'paragraph' && textOf(model.blocks[0].inlines)).toBe('Hello, reader.');
    expect(model.notes).toEqual([]);
  });
});

describe('built files', () => {
  it('reports a password-protected file as encrypted', async () => {
    const manifest = manifestXml('<manifest:encryption-data manifest:checksum-type="SHA1/1K"/>');
    await expect(parse(await buildOdt({ manifest }))).rejects.toMatchObject({ code: 'encrypted' });
  });

  it('reports a missing content.xml as corrupt', async () => {
    await expect(parse(await buildOdt({ content: null }))).rejects.toMatchObject({ code: 'corrupt' });
  });

  it('reports malformed content.xml as corrupt', async () => {
    const error: unknown = await parse(await buildOdt({ content: '<office:document-content><text:p>' })).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(DocumentError);
    expect(error).toMatchObject({ code: 'corrupt' });
  });

  it('reports a content.xml without a text body as corrupt', async () => {
    const content = contentXml('')
      .replace('office:text', 'office:spreadsheet')
      .replace('office:text', 'office:spreadsheet');
    await expect(parse(await buildOdt({ content }))).rejects.toMatchObject({ code: 'corrupt' });
  });

  it('turns text:s with text:c into that many spaces', async () => {
    const model = await parse(await buildOdt({ content: contentXml('<text:p>a<text:s text:c="3"/>b</text:p>') }));
    expect(textOf((model.blocks[0] as Paragraph).inlines)).toBe('a   b');
  });

  it('gives a text:list-header no marker', async () => {
    const content = contentXml(
      '<text:list text:style-name="L"><text:list-header><text:p>Head</text:p></text:list-header><text:list-item><text:p>One</text:p></text:list-item></text:list>',
      '',
    );
    const styles = stylesXml({
      styles:
        '<text:list-style style:name="L"><text:list-level-style-number text:level="1" style:num-format="1" style:num-suffix="."/></text:list-style>',
    });
    const model = await parse(await buildOdt({ content, styles }));
    expect(paragraphs(model.blocks).map((p) => p.list?.marker)).toEqual(['', '1.']);
  });

  it('leaves out the content of text:tracked-changes', async () => {
    const content = contentXml(
      '<text:tracked-changes><text:changed-region><text:deletion><text:p>Deleted words</text:p></text:deletion></text:changed-region></text:tracked-changes><text:p>Final text</text:p>',
    );
    const model = await parse(await buildOdt({ content }));
    expect(model.blocks.map((b) => (b.kind === 'paragraph' ? textOf(b.inlines) : b.kind))).toEqual(['Final text']);
  });

  it('gives an image with an external href no src', async () => {
    const content = contentXml(
      '<text:p><draw:frame svg:width="1in" svg:height="1in"><draw:image xlink:href="https://example.com/x.png"/></draw:frame></text:p>',
    );
    const model = await parse(await buildOdt({ content, files: { 'x.png': PNG_BYTES } }));
    expect((model.blocks[0] as Paragraph).inlines).toEqual([{ kind: 'image', widthPx: 96, heightPx: 96 }]);
  });

  it('reads pictures from the zip', async () => {
    const content = contentXml(
      '<text:p><draw:frame svg:width="1in" svg:height="0.5in"><draw:image xlink:href="Pictures/p.jpg"/></draw:frame></text:p>',
    );
    const model = await parse(await buildOdt({ content, files: { 'Pictures/p.jpg': JPEG_BYTES } }));
    expect((model.blocks[0] as Paragraph).inlines).toEqual([
      { kind: 'image', widthPx: 96, heightPx: 48, src: { mime: 'image/jpeg', data: JPEG_BYTES } },
    ]);
  });

  it('keeps counting in a list continued with text:continue-numbering', async () => {
    const list = (attrs: string, text: string) =>
      `<text:list text:style-name="L" ${attrs}><text:list-item><text:p>${text}</text:p></text:list-item></text:list>`;
    const content = contentXml(
      list('', 'one') + '<text:p>between</text:p>' + list('text:continue-numbering="true"', 'two'),
    );
    const styles = stylesXml({
      styles:
        '<text:list-style style:name="L"><text:list-level-style-number text:level="1" style:num-format="1" style:num-suffix="."/></text:list-style>',
    });
    const model = await parse(await buildOdt({ content, styles }));
    expect(paragraphs(model.blocks).map((p) => p.list?.marker)).toEqual(['1.', undefined, '2.']);
  });

  it('gives a title only when meta.xml has a non-empty one', async () => {
    expect((await parse(await buildOdt({ meta: metaXml('  My title ') }))).title).toBe('My title');
    expect((await parse(await buildOdt({ meta: metaXml('') }))).title).toBeUndefined();
    expect((await parse(await buildOdt({}))).title).toBeUndefined();
  });

  it('is A4 when the file has no page layout', async () => {
    const model = await parse(await buildOdt({}));
    expect(model.page).toMatchObject({ widthMm: 210, heightMm: 297, marginLeftMm: 25.4 });
  });

  it('stops when the signal is aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(parseOdt(await buildOdt({}), controller.signal)).rejects.toThrow();
  });

  it('stops between stages when aborted while the package is being read', async () => {
    const controller = new AbortController();
    const bytes = await buildOdt({ content: contentXml('<text:p>x</text:p>') });
    const result = parseOdt(bytes, controller.signal);
    controller.abort();
    await expect(result).rejects.toThrow();
  });
});

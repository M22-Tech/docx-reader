import { describe, expect, it } from 'vitest';
import { DocumentError } from '../../document-error';
import type { Block, DocumentModel, ImageInline, Inline, Paragraph, Table, TextRun } from '../../model/document-model';
import { adapterFor } from '../registry';
import { editStreams, FIB_OFFSET, fixture, setU16, setU32, signal } from './doc-test-helpers';
import { parseOdt } from '../odt/parse-odt';
import { parseRtf } from '../rtf/parse-rtf';
import { parseDoc } from './parse-doc';

const textOf = (inlines: Inline[]): string =>
  inlines.map((i) => (i.kind === 'text' ? i.text : i.kind === 'link' ? textOf(i.inlines) : '')).join('');
const paragraphs = (blocks: Block[]): Paragraph[] => blocks.filter((b): b is Paragraph => b.kind === 'paragraph');
const texts = (model: DocumentModel) => paragraphs(model.blocks).map((p) => textOf(p.inlines));
const find = (model: DocumentModel, start: string): Paragraph => {
  const found = paragraphs(model.blocks).find((p) => textOf(p.inlines).startsWith(start));
  if (!found) throw new Error(`no paragraph starting with "${start}"`);
  return found;
};
const textRuns = (inlines: Inline[]): TextRun[] =>
  inlines.flatMap((i) => (i.kind === 'text' ? [i] : i.kind === 'link' ? textRuns(i.inlines) : []));
/** The run holding exactly `text`, from the paragraph that starts with `paragraph`. */
const run = (model: DocumentModel, paragraph: string, text: string): TextRun => {
  const found = textRuns(find(model, paragraph).inlines).find((r) => r.text === text);
  if (!found) throw new Error(`no run "${text}" in "${paragraph}"`);
  return found;
};
const CALIBRI = { fontFamily: 'Calibri' };
const MARKS_PARAGRAPH = 'Plain, bold';
const codeOf = async (bytes: Uint8Array) => {
  try {
    await parseDoc(bytes, signal());
  } catch (error) {
    return error instanceof DocumentError ? error.code : 'other';
  }
  return 'none';
};

describe('features.doc', () => {
  const model = parseDoc(fixture('features.doc'), signal());

  it('gives the paragraphs in order', async () => {
    const all = texts(await model);
    expect(all.slice(0, 4)).toEqual([
      'Feature fixture',
      'Heading one',
      'Plain, bold, italic, underlined, struck, red, highlighted, E = mc2, H2O.',
      'Large 18 pt Georgia. Small 8 pt Courier New.',
    ]);
    expect(all.indexOf('Heading two')).toBeGreaterThan(all.indexOf('Heading one'));
    expect(all.at(-1)).toBe('This paragraph starts the second page.');
  });

  it('has a line break and a tab', async () => {
    const m = await model;
    expect(find(m, 'Line one').inlines).toEqual([
      { kind: 'text', text: 'Line one', marks: CALIBRI },
      { kind: 'lineBreak' },
      { kind: 'text', text: 'Line two after a line break', marks: CALIBRI },
    ]);
    expect(find(m, 'Before tab').inlines).toEqual([
      { kind: 'text', text: 'Before tab', marks: CALIBRI },
      { kind: 'tab' },
      { kind: 'text', text: 'after tab', marks: CALIBRI },
    ]);
  });

  it('has the link around "example.com", with no instruction or field data', async () => {
    const paragraph = find(await model, 'A link to');
    expect(paragraph.inlines).toEqual([
      { kind: 'text', text: 'A link to ', marks: CALIBRI },
      {
        kind: 'link',
        href: 'https://example.com/path?q=1',
        inlines: [
          { kind: 'text', text: 'example.com', marks: { underline: true, color: '#0563c1', fontFamily: 'Calibri' } },
        ],
      },
      { kind: 'text', text: ' and a footnote', marks: CALIBRI },
      { kind: 'noteRef', noteId: 'fn1', label: '1' },
      { kind: 'text', text: '.', marks: CALIBRI },
    ]);
    const json = JSON.stringify((await model).blocks);
    expect(json).not.toContain('HYPERLINK');
    expect(json).not.toMatch(/\\u00(01|13|14|15)/);
  });

  it('reads the list markers from the list tables and gives the items a left indent', async () => {
    const m = await model;
    const summary = [
      'First numbered item',
      'Nested lettered item',
      'Second numbered item',
      'Bullet item',
      'Nested bullet item',
    ].map((text) => {
      const p = find(m, text);
      return [text, p.list?.marker, p.list?.level, p.list?.ordered, (p.indentLeftMm ?? 0) > 0];
    });
    expect(summary).toEqual([
      ['First numbered item', '1.', 0, true, true],
      ['Nested lettered item', 'a)', 1, true, true],
      ['Second numbered item', '2.', 0, true, true],
      ['Bullet item', '•', 0, false, true],
      ['Nested bullet item', '◦', 1, false, true],
    ]);
    expect(find(m, 'First numbered item').indentLeftMm).toBeCloseTo(12.7, 2);
    expect(find(m, 'Nested lettered item').indentLeftMm).toBeCloseTo(25.4, 2);
    expect(find(m, 'First numbered item').firstLineMm).toBeCloseTo(-6.35, 2);
    expect(find(m, 'Heading three').list).toBeUndefined();
  });

  it('reads the table with its spans, merged cell and column widths', async () => {
    const m = await model;
    const table = m.blocks.find((b): b is Table => b.kind === 'table');
    if (!table) throw new Error('no table');
    expect(m.blocks.filter((b) => b.kind === 'table')).toHaveLength(1);
    expect(table.rows).toHaveLength(4);
    expect(table.rows.map((r) => r.header)).toEqual([true, undefined, undefined, undefined]);
    expect(
      table.rows.map((row) =>
        row.cells.map((c) => c.blocks.map((b) => (b.kind === 'paragraph' ? textOf(b.inlines) : '')).join('')),
      ),
    ).toEqual([
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

  it('puts the paragraph after the table outside it, and leaves no cell text in the body', async () => {
    const m = await model;
    const index = m.blocks.findIndex((b) => b.kind === 'table');
    // Word keeps an empty paragraph after a table; the text that follows it is body text too.
    expect(m.blocks[index + 1]).toEqual({ kind: 'paragraph', inlines: [] });
    const next = m.blocks.slice(index + 1).find((b): b is Paragraph => b.kind === 'paragraph' && b.inlines.length > 0);
    expect(textOf(next?.inlines ?? [])).toMatch(/^हिन्दी/);
    const body = texts(m);
    for (const cellText of ['Name', 'Role', 'City', 'Asha', 'Engineer', 'Delhi', 'Ravi', 'Designer', 'Pune']) {
      expect(body).not.toContain(cellText);
    }
    expect(body).not.toContain('Spans two columns');
    expect(JSON.stringify(m.blocks)).not.toContain('\u0007');
  });

  it('keeps the Hindi and Bengali sentence unchanged', async () => {
    expect(texts(await model)).toContain('हिन्दी पाठ: यह एक परीक्षण अनुच्छेद है। বাংলা: এটি একটি পরীক্ষা।');
  });

  it('has no header or footnote text in the body', async () => {
    const m = await model;
    expect(texts(m).join('\n')).not.toContain('Fixture header text');
    expect(texts(m).join('\n')).not.toContain('footnote one');
  });

  it('has the two inline images, PNG then JPEG, in their own paragraphs', async () => {
    const images = paragraphs((await model).blocks)
      .flatMap((p) => p.inlines)
      .filter((i): i is ImageInline => i.kind === 'image');
    expect(images.map((i) => [i.src?.mime, i.widthPx, i.heightPx])).toEqual([
      ['image/png', 240, 120],
      ['image/jpeg', 320, 200],
    ]);
    expect([...(images[0]?.src?.data.subarray(0, 4) ?? [])]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect([...(images[1]?.src?.data.subarray(0, 3) ?? [])]).toEqual([0xff, 0xd8, 0xff]);
  });

  it('has one noteRef "1" after "and a footnote", and one note with its text', async () => {
    const m = await model;
    const refs = paragraphs(m.blocks)
      .flatMap((p) => p.inlines)
      .filter((i) => i.kind === 'noteRef');
    expect(refs).toEqual([{ kind: 'noteRef', noteId: 'fn1', label: '1' }]);
    const paragraph = find(m, 'A link to');
    const at = paragraph.inlines.findIndex((i) => i.kind === 'noteRef');
    expect(paragraph.inlines[at - 1]).toMatchObject({ kind: 'text', text: ' and a footnote' });
    expect(m.notes.map((n) => [n.id, n.label, paragraphs(n.blocks).map((p) => textOf(p.inlines))])).toEqual([
      ['fn1', '1', ['This is footnote one, at the bottom of the page.']],
    ]);
  });

  it('has the title and the headings at levels 1, 1, 2, 3, and "Second page" at 1', async () => {
    const m = await model;
    const headings = paragraphs(m.blocks).filter((p) => p.headingLevel !== undefined);
    expect(headings.map((p) => [textOf(p.inlines), p.headingLevel])).toEqual([
      ['Feature fixture', 1],
      ['Heading one', 1],
      ['Heading two', 2],
      ['Heading three', 3],
      ['Second page', 1],
    ]);
  });

  it('puts a page break right before "Second page", and none at the start', async () => {
    const m = await model;
    const index = m.blocks.findIndex((b) => b.kind === 'paragraph' && textOf(b.inlines) === 'Second page');
    expect(m.blocks[index - 1]).toEqual({ kind: 'pageBreak' });
    expect(m.blocks.filter((b) => b.kind === 'pageBreak')).toHaveLength(1);
    expect(m.blocks[0]?.kind).toBe('paragraph');
  });

  it('marks bold, italic, underline and strike', async () => {
    const m = await model;
    expect(run(m, MARKS_PARAGRAPH, 'bold').marks).toMatchObject({ bold: true });
    expect(run(m, MARKS_PARAGRAPH, 'italic').marks).toMatchObject({ italic: true });
    expect(run(m, MARKS_PARAGRAPH, 'underlined').marks).toMatchObject({ underline: true });
    expect(run(m, MARKS_PARAGRAPH, 'struck').marks).toMatchObject({ strike: true });
    expect(run(m, MARKS_PARAGRAPH, 'bold').marks).not.toHaveProperty('italic');
    expect(run(m, MARKS_PARAGRAPH, 'italic').marks).not.toHaveProperty('bold');
  });

  it('colours "red" #c00000 and highlights "highlighted" #ffff00', async () => {
    const m = await model;
    expect(run(m, MARKS_PARAGRAPH, 'red').marks).toMatchObject({ color: '#c00000' });
    expect(run(m, MARKS_PARAGRAPH, 'highlighted').marks).toMatchObject({ highlight: '#ffff00' });
    expect(run(m, MARKS_PARAGRAPH, ', ').marks).not.toHaveProperty('color');
  });

  it('has the superscript 2 after "mc" and the subscript 2 after "H"', async () => {
    const runs = textRuns(find(await model, MARKS_PARAGRAPH).inlines);
    const sup = runs.findIndex((r) => r.marks?.superscript);
    expect(runs[sup]?.text).toBe('2');
    expect(runs[sup - 1]?.text.endsWith('mc')).toBe(true);
    const sub = runs.findIndex((r) => r.marks?.subscript);
    expect(runs[sub]?.text).toBe('2');
    expect(runs[sub - 1]?.text.endsWith('H')).toBe(true);
  });

  it('has Georgia 18 pt and Courier New 8 pt, and no size mark at 11 pt', async () => {
    const m = await model;
    expect(run(m, 'Large 18 pt', 'Large 18 pt Georgia. ').marks).toMatchObject({
      fontFamily: 'Georgia',
      fontSizePt: 18,
    });
    expect(run(m, 'Large 18 pt', 'Small 8 pt Courier New.').marks).toMatchObject({
      fontFamily: 'Courier New',
      fontSizePt: 8,
    });
    expect(run(m, MARKS_PARAGRAPH, 'bold').marks).not.toHaveProperty('fontSizePt');
  });

  it('aligns centre, right and justify, and leaves left unset', async () => {
    const m = await model;
    expect(find(m, 'Centred paragraph').align).toBe('center');
    expect(find(m, 'Right-aligned').align).toBe('right');
    expect(find(m, 'Justified paragraph').align).toBe('justify');
    expect(find(m, 'Before tab').align).toBeUndefined();
  });

  it('reads the page: 210 by 297 mm with 25.4 mm margins', async () => {
    const { page } = await model;
    expect(page?.widthMm).toBeCloseTo(210, 1);
    expect(page?.heightMm).toBeCloseTo(297, 1);
    expect(page?.marginLeftMm).toBeCloseTo(25.4, 1);
    expect(page?.marginRightMm).toBeCloseTo(25.4, 1);
    expect(page?.marginTopMm).toBeCloseTo(25.4, 1);
    expect(page?.marginBottomMm).toBeCloseTo(25.4, 1);
  });
});

describe('formatting built from features.doc', () => {
  const features = fixture('features.doc');
  /** Replaces the only occurrence of a byte sequence in a stream. */
  const replace = (stream: Uint8Array, from: number[], to: number[]) => {
    const at = stream.findIndex((_, i) => from.every((b, j) => stream[i + j] === b));
    if (at < 0) throw new Error('byte sequence not found');
    stream.set(to, at);
  };

  it('leaves no text for a run with sprmCFVanish or sprmCFRMarkDel', async () => {
    // The "bold" run is sprmCFBold on; "italic" is sprmCFItalic on. Turn them into hidden and deleted text.
    const edited = editStreams(features, {
      WordDocument: (s) => {
        replace(s, [0x35, 0x08, 0x01], [0x3c, 0x08, 0x01]);
        replace(s, [0x36, 0x08, 0x01], [0x00, 0x08, 0x01]);
      },
    });
    const model = await parseDoc(edited, signal());
    expect(
      find(model, 'Plain, ')
        .inlines.map((i) => (i.kind === 'text' ? i.text : ''))
        .join(''),
    ).toBe('Plain, , , underlined, struck, red, highlighted, E = mc2, H2O.');
  });

  it('applies the sprm of a piece Prm0 to all its text', async () => {
    // The only piece's Pcd is the last 8 bytes of the 21-byte Clx at 1Table offset 5364; its Prm is the last 2 bytes.
    // isprm 0x55 is sprmCFBold and val 1 turns it on.
    const edited = editStreams(features, { '1Table': (s) => setU16(s, 5364 + 21 - 2, (0x55 << 1) | (1 << 8)) });
    const model = await parseDoc(edited, signal());
    for (const paragraph of paragraphs(model.blocks)) {
      for (const r of textRuns(paragraph.inlines)) expect(r.marks?.bold, r.text).toBe(true);
    }
    expect(run(model, 'Large 18 pt', 'Large 18 pt Georgia. ').marks).toMatchObject({ bold: true, fontSizePt: 18 });
  });
});

describe('minimal.doc', () => {
  it('gives one paragraph', async () => {
    const model = await parseDoc(fixture('minimal.doc'), signal());
    // LibreOffice saved this file with a 10 pt Times New Roman Normal style.
    expect(model.blocks).toEqual([
      {
        kind: 'paragraph',
        inlines: [{ kind: 'text', text: 'Hello, reader.', marks: { fontFamily: 'Times New Roman', fontSizePt: 10 } }],
      },
    ]);
  });
});

describe('errors', () => {
  const features = fixture('features.doc');
  const word = (edit: (stream: Uint8Array) => void) => editStreams(features, { WordDocument: edit });

  it('rejects a changed wIdent as corrupt', async () => {
    expect(await codeOf(word((s) => setU16(s, 0, 0)))).toBe('corrupt');
  });

  it('rejects Word 95 as unsupported_version', async () => {
    expect(await codeOf(word((s) => setU16(s, FIB_OFFSET.nFib, 0x0065)))).toBe('unsupported_version');
  });

  it('rejects fEncrypted as encrypted', async () => {
    expect(await codeOf(word((s) => setU16(s, FIB_OFFSET.flags, 0x0300)))).toBe('encrypted');
  });

  it('rejects a missing table stream as corrupt', async () => {
    expect(await codeOf(editStreams(features, { '1Table': null }))).toBe('corrupt');
  });

  it('rejects a Clx lcb beyond the stream as corrupt', async () => {
    expect(await codeOf(word((s) => setU32(s, FIB_OFFSET.clxLcb, 0x00ffffff)))).toBe('corrupt');
  });

  it('rejects an absent Clx as corrupt', async () => {
    expect(await codeOf(word((s) => setU32(s, FIB_OFFSET.clxLcb, 0)))).toBe('corrupt');
  });

  it('rejects a file that is not a doc, and a garbled compound file, as corrupt', async () => {
    expect(await codeOf(editStreams(features, { Data: null, '1Table': null }))).toBe('corrupt');
    expect(await codeOf(Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]))).toBe('corrupt');
  });

  it('stops when the signal is aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(parseDoc(features, controller.signal)).rejects.toThrow();
  });
});

describe('registry', () => {
  it('has a doc adapter with both modes', () => {
    expect(adapterFor('doc')).toMatchObject({ format: 'doc', modes: ['layout', 'reading'] });
  });
});

describe('features.doc against features.odt and features.rtf', () => {
  /**
   * Block kinds, heading levels, list markers and text, with images and note references shown in place. Sizes are left
   * out: the odt stores the images' sizes in rounded centimetres (320.02 px for the doc's 320).
   */
  const inlineText = (inlines: Inline[]): string =>
    inlines
      .map((i) => {
        switch (i.kind) {
          case 'text':
            return i.text;
          case 'link':
            return inlineText(i.inlines);
          case 'tab':
            return '\t';
          case 'lineBreak':
            return '\n';
          case 'image':
            return `[image ${i.src?.mime ?? 'none'}]`;
          case 'noteRef':
            return `[note ${i.label}]`;
          case 'anchor':
            return '';
        }
      })
      .join('');
  const shape = (block: Block): unknown =>
    block.kind === 'paragraph'
      ? ['paragraph', block.headingLevel ?? null, block.list?.marker ?? null, inlineText(block.inlines)]
      : block.kind === 'pageBreak'
        ? ['pageBreak']
        : ['table', block.rows.map((row) => row.cells.map((cell) => cell.blocks.map(shape)))];
  /** Note ids differ between the parsers, so notes are compared by label and content. */
  const shapeOf = (model: DocumentModel) => ({
    blocks: model.blocks.map(shape),
    notes: model.notes.map((note) => [note.label, note.blocks.map(shape)]),
  });

  it('gives the same block kinds, heading levels, list markers, paragraph texts, images and notes', async () => {
    const doc = shapeOf(await parseDoc(fixture('features.doc'), signal()));
    const odt = shapeOf(await parseOdt(fixture('features.odt'), signal()));
    const rtf = shapeOf(await parseRtf(fixture('features.rtf'), signal()));
    expect(doc.blocks.length).toBeGreaterThan(20);
    expect(odt).toEqual(doc);
    expect(rtf).toEqual(doc);
  });
});

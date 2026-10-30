import { describe, expect, it } from 'vitest';
import { DocumentError } from '../../document-error';
import type { Block, DocumentModel, Inline, Paragraph } from '../../model/document-model';
import { adapterFor } from '../registry';
import { editStreams, FIB_OFFSET, fixture, setU16, setU32, signal } from './doc-test-helpers';
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
      { kind: 'text', text: 'Line one' },
      { kind: 'lineBreak' },
      { kind: 'text', text: 'Line two after a line break' },
    ]);
    expect(find(m, 'Before tab').inlines).toEqual([
      { kind: 'text', text: 'Before tab' },
      { kind: 'tab' },
      { kind: 'text', text: 'after tab' },
    ]);
  });

  it('has the link around "example.com", with no instruction or field data', async () => {
    const paragraph = find(await model, 'A link to');
    expect(paragraph.inlines).toEqual([
      { kind: 'text', text: 'A link to ' },
      { kind: 'link', href: 'https://example.com/path?q=1', inlines: [{ kind: 'text', text: 'example.com' }] },
      { kind: 'text', text: ' and a footnote.' },
    ]);
    const json = JSON.stringify((await model).blocks);
    expect(json).not.toContain('HYPERLINK');
    expect(json).not.toMatch(/\\u00(01|13|14|15)/);
  });

  it('has the table cells as paragraphs', async () => {
    const all = texts(await model);
    const start = all.indexOf('Name');
    expect(all.slice(start, start + 6)).toEqual(['Name', 'Role', 'City', 'Asha', 'Engineer', 'Delhi']);
    expect(all).toEqual(expect.arrayContaining(['Ravi', 'Designer', 'Spans two columns', 'Pune']));
    expect((await model).blocks.some((b) => b.kind === 'table')).toBe(false);
  });

  it('keeps the Hindi and Bengali sentence unchanged', async () => {
    expect(texts(await model)).toContain('हिन्दी पाठ: यह एक परीक्षण अनुच्छेद है। বাংলা: এটি একটি পরীক্ষা।');
  });

  it('has no header or footnote text in the body, and no page yet', async () => {
    const m = await model;
    expect(texts(m).join('\n')).not.toContain('Fixture header text');
    expect(texts(m).join('\n')).not.toContain('footnote one');
    expect(m.page).toBeUndefined();
    expect(m.notes).toEqual([]);
  });
});

describe('minimal.doc', () => {
  it('gives one paragraph', async () => {
    const model = await parseDoc(fixture('minimal.doc'), signal());
    expect(model.blocks).toEqual([{ kind: 'paragraph', inlines: [{ kind: 'text', text: 'Hello, reader.' }] }]);
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

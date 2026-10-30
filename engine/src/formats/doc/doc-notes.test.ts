import { describe, expect, it } from 'vitest';
import type { Block, Inline } from '../../model/document-model';
import { openDocContainer } from './doc-container';
import { FcLcb, readFib, type Fib } from './doc-fib';
import { buildNotes, readNoteTables } from './doc-notes';
import type { DocFormat } from './doc-paragraphs';
import { createStyleSheet } from './doc-styles';
import type { DocText } from './doc-text';
import { fixture } from './doc-test-helpers';

const textOf = (blocks: Block[]): string[] =>
  blocks.map((block) =>
    block.kind === 'paragraph'
      ? block.inlines.map((i: Inline) => (i.kind === 'text' ? i.text : `<${i.kind}>`)).join('')
      : '---',
  );

describe('features.doc notes', () => {
  const { fibBase, wordDocument, table } = openDocContainer(fixture('features.doc'));
  const fib = readFib(wordDocument, table.length, fibBase);

  it('has the PLCs the design describes: one reference at CP 542, text CPs 0, 50, 51', () => {
    expect(fib.ccpText).toBe(862);
    expect(fib.ccpFtn).toBe(51);
    const dv = new DataView(table.buffer, table.byteOffset);
    const ref = fib.pair(FcLcb.PlcffndRef)!;
    expect([dv.getUint32(ref.fc, true), dv.getInt16(ref.fc + 8, true)]).toEqual([542, 1]);
    const txt = fib.pair(FcLcb.PlcffndTxt)!;
    expect([0, 1, 2].map((i) => dv.getUint32(txt.fc + i * 4, true))).toEqual([0, 50, 51]);
  });
});

/** Table stream pieces and a fake `Fib` over them, with the text as one string. */
function setup(parts: { main: string; footnotes?: string; endnotes?: string }) {
  const footnotes = parts.footnotes ?? '';
  const endnotes = parts.endnotes ?? '';
  const full = parts.main + footnotes + endnotes;
  const bytes: number[] = [];
  const pairs = new Map<number, { fc: number; lcb: number }>();
  const u32 = (out: number[], v: number) => out.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
  const add = (index: number, data: number[]) => {
    pairs.set(index, { fc: bytes.length, lcb: data.length });
    bytes.push(...data);
  };
  /** A reference PLC: the CPs, then one `FRD` per reference (0 is a custom mark). */
  const refs = (index: number, cps: number[], frds: number[]) => {
    const data: number[] = [];
    for (const cp of cps) u32(data, cp);
    for (const frd of frds) data.push(frd & 0xff, (frd >> 8) & 0xff);
    add(index, data);
  };
  const texts = (index: number, cps: number[]) => {
    const data: number[] = [];
    for (const cp of cps) u32(data, cp);
    add(index, data);
  };
  const fib = {
    nFib: 0x101,
    whichTableStream: 1,
    ccpText: parts.main.length,
    ccpFtn: footnotes.length,
    ccpHdd: 0,
    ccpAtn: 0,
    ccpEdn: endnotes.length,
    ccpTxbx: 0,
    ccpHdrTxbx: 0,
    pair: (index: number) => pairs.get(index),
  } satisfies Fib;
  const text: DocText = {
    prcs: [],
    pieces: [],
    cpEnd: full.length,
    text: (a, b) => full.slice(a, b),
    cpToFc: () => undefined,
  };
  const format: DocFormat = { text, chpx: [], papx: [], styles: createStyleSheet([]), fonts: [] };
  return {
    get table() {
      return Uint8Array.from(bytes);
    },
    fib,
    text,
    format,
    refs,
    texts,
  };
}

describe('readNoteTables and buildNotes', () => {
  it('reads two footnotes and an endnote: footnotes first, then endnotes, each in reference order', () => {
    // Main text refs at CP 1 (footnote), 3 (endnote) and 5 (footnote).
    const t = setup({
      main: 'A\x02 B\x02 C\x02\r',
      footnotes: '\x02 One\r\x02 Two\r\r',
      endnotes: '\x02 End\r\r',
    });
    t.refs(FcLcb.PlcffndRef, [1, 5, 6], [1, 1]);
    t.texts(FcLcb.PlcffndTxt, [0, 6, 12, 13]);
    t.refs(FcLcb.PlcfendRef, [3, 4], [1]);
    t.texts(FcLcb.PlcfendTxt, [0, 6, 7]);
    const tables = readNoteTables(t.table, t.fib, t.text);

    expect(tables.notes.map((n) => [n.id, n.label, n.refCp])).toEqual([
      ['fn1', '1', 1],
      ['fn2', '2', 5],
      ['en1', 'i', 3],
    ]);
    expect([...tables.refs]).toEqual([
      [1, { kind: 'noteRef', noteId: 'fn1', label: '1' }],
      [5, { kind: 'noteRef', noteId: 'fn2', label: '2' }],
      [3, { kind: 'noteRef', noteId: 'en1', label: 'i' }],
    ]);
    const notes = buildNotes(tables.notes, t.text, t.format);
    expect(notes.map((n) => [n.id, n.label, textOf(n.blocks)])).toEqual([
      ['fn1', '1', ['One']],
      ['fn2', '2', ['Two']],
      ['en1', 'i', ['End']],
    ]);
  });

  it('numbers endnotes in lower Roman: i, ii, iii, iv', () => {
    const t = setup({ main: 'a\x02b\x02c\x02d\x02\r', endnotes: '\x02 1\r\x02 2\r\x02 3\r\x02 4\r\r' });
    t.refs(FcLcb.PlcfendRef, [1, 3, 5, 7, 8], [1, 1, 1, 1]);
    t.texts(FcLcb.PlcfendTxt, [0, 4, 8, 12, 16, 17]);
    expect(readNoteTables(t.table, t.fib, t.text).notes.map((n) => n.label)).toEqual(['i', 'ii', 'iii', 'iv']);
  });

  it('uses the reference text as a custom mark, drops it from the note, and does not number it', () => {
    // Main: "a*b" + "\x02" + ".\r": refs at CP 1 (custom "*") and CP 3 (auto).
    const t = setup({ main: 'a*b\x02.\r', footnotes: '* Star\r\x02 Auto\r\r' });
    t.refs(FcLcb.PlcffndRef, [1, 3, 4], [0, 1]);
    t.texts(FcLcb.PlcffndTxt, [0, 7, 14, 15]);
    const tables = readNoteTables(t.table, t.fib, t.text);
    expect(tables.notes.map((n) => [n.label, n.custom])).toEqual([
      ['*', true],
      ['1', false],
    ]);
    expect(tables.refs.get(1)).toEqual({ kind: 'noteRef', noteId: 'fn1', label: '*' });
    expect(buildNotes(tables.notes, t.text, t.format).map((n) => textOf(n.blocks))).toEqual([['Star'], ['Auto']]);
  });

  it('numbers a custom mark with nothing printable in it', () => {
    const t = setup({ main: 'a b\r', footnotes: '\x02 Note\r\r' });
    t.refs(FcLcb.PlcffndRef, [1, 2], [0]);
    t.texts(FcLcb.PlcffndTxt, [0, 7, 8]);
    expect(readNoteTables(t.table, t.fib, t.text).notes.map((n) => [n.label, n.custom])).toEqual([['1', false]]);
  });

  it('leaves out a note, with its reference, when its range or reference is outside', () => {
    const t = setup({ main: 'a\x02b\x02\r', footnotes: '\x02 One\r\r' });
    // The second note's text range runs past the part; a third reference lies beyond the main text.
    t.refs(FcLcb.PlcffndRef, [1, 3, 900, 901], [1, 1, 1]);
    t.texts(FcLcb.PlcffndTxt, [0, 6, 99, 100, 101]);
    const tables = readNoteTables(t.table, t.fib, t.text);
    expect(tables.notes.map((n) => n.id)).toEqual(['fn1']);
    expect([...tables.refs.keys()]).toEqual([1]);
  });

  it('gives no notes when the tables are absent or empty', () => {
    const t = setup({ main: 'a\r' });
    expect(readNoteTables(t.table, t.fib, t.text)).toEqual({ notes: [], refs: new Map() });
    t.refs(FcLcb.PlcffndRef, [0], []);
    t.texts(FcLcb.PlcffndTxt, [0]);
    expect(readNoteTables(t.table, t.fib, t.text).notes).toEqual([]);
  });

  it('keeps a note with no leading mark as it is, and parses several paragraphs', () => {
    const t = setup({ main: 'a\x02\r', footnotes: 'Plain\rSecond\r\r' });
    t.refs(FcLcb.PlcffndRef, [1, 2], [1]);
    t.texts(FcLcb.PlcffndTxt, [0, 13, 14]);
    const tables = readNoteTables(t.table, t.fib, t.text);
    expect(textOf(buildNotes(tables.notes, t.text, t.format)[0]!.blocks)).toEqual(['Plain', 'Second']);
  });
});

import { describe, expect, it } from 'vitest';
import type { Inline } from '../../model/document-model';
import { readBookmarks } from './doc-bookmarks';
import { buildBlocks, type DocFormat } from './doc-paragraphs';
import { createStyleSheet } from './doc-styles';

/** An `SttbfBkmk` and a `PlcfBkf` in one table stream, so each pair points at its own part. */
function tables(names: string[], starts: number[], options: { extended?: boolean; cbExtra?: number } = {}) {
  const sttb: number[] = [];
  const u16 = (out: number[], v: number) => out.push(v & 0xff, v >> 8);
  const u32 = (out: number[], v: number) => out.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
  u16(sttb, options.extended === false ? 0 : 0xffff);
  u16(sttb, names.length);
  u16(sttb, options.cbExtra ?? 0);
  for (const name of names) {
    u16(sttb, name.length);
    for (const char of name) u16(sttb, char.charCodeAt(0));
    for (let i = 0; i < (options.cbExtra ?? 0); i++) sttb.push(0);
  }
  const plc: number[] = [];
  for (const cp of starts) u32(plc, cp);
  u32(plc, 9999);
  // One `BKF` per bookmark: `ibkl` and `bkc`.
  for (let i = 0; i < starts.length; i++) u32(plc, i);
  return {
    table: Uint8Array.from([...sttb, ...plc]),
    names: { fc: 0, lcb: sttb.length },
    starts: { fc: sttb.length, lcb: plc.length },
  };
}

describe('readBookmarks', () => {
  it('reads names and start CPs, sorted by CP', () => {
    const t = tables(['Beta', '_Toc9', 'Alpha'], [30, 10, 20]);
    expect(readBookmarks(t.table, t.names, t.starts)).toEqual([
      { name: '_Toc9', cp: 10 },
      { name: 'Alpha', cp: 20 },
      { name: 'Beta', cp: 30 },
    ]);
  });

  it('skips the extra bytes after each name', () => {
    const t = tables(['One', 'Two'], [4, 8], { cbExtra: 2 });
    expect(readBookmarks(t.table, t.names, t.starts)).toEqual([
      { name: 'One', cp: 4 },
      { name: 'Two', cp: 8 },
    ]);
  });

  it('leaves out empty and repeated names, keeping the first', () => {
    const t = tables(['A', '', 'A', 'B'], [1, 2, 3, 4]);
    expect(readBookmarks(t.table, t.names, t.starts)).toEqual([
      { name: 'A', cp: 1 },
      { name: 'B', cp: 4 },
    ]);
  });

  it('reads only the bookmarks the tables hold when they disagree or are cut short', () => {
    const t = tables(['A', 'B', 'C'], [1, 2]);
    expect(readBookmarks(t.table, t.names, t.starts).map((b) => b.name)).toEqual(['A', 'B']);
    const cut = tables(['A', 'BBBB'], [1, 2]);
    expect(readBookmarks(cut.table, { fc: 0, lcb: cut.names.lcb - 4 }, cut.starts)).toEqual([{ name: 'A', cp: 1 }]);
  });

  it('gives nothing for missing, tiny or non-Unicode tables', () => {
    const t = tables(['A'], [1]);
    expect(readBookmarks(t.table, undefined, t.starts)).toEqual([]);
    expect(readBookmarks(t.table, t.names, undefined)).toEqual([]);
    expect(readBookmarks(t.table, { fc: 0, lcb: 4 }, t.starts)).toEqual([]);
    const old = tables(['A'], [1], { extended: false });
    expect(readBookmarks(old.table, old.names, old.starts)).toEqual([]);
  });
});

describe('bookmarks in the model', () => {
  const format = (length: number, bookmarks: DocFormat['bookmarks']): DocFormat => ({
    text: { prcs: [], pieces: [], cpEnd: length, text: () => '', cpToFc: () => undefined },
    chpx: [],
    papx: [],
    styles: createStyleSheet([]),
    fonts: [],
    ...(bookmarks ? { bookmarks } : {}),
  });
  const kinds = (inlines: Inline[]): string[] =>
    inlines.map((i) =>
      i.kind === 'text'
        ? i.text
        : i.kind === 'anchor'
          ? `#${i.id}`
          : i.kind === 'link'
            ? `link ${i.href}(${kinds(i.inlines).join('')})`
            : i.kind,
    );

  it('puts an anchor at its CP, and a HYPERLINK \\l link to it meets the anchor', () => {
    const text = 'See \x13HYPERLINK \\l "Target"\x14here\x15.\rThe target\r';
    const at = text.indexOf('The target');
    const blocks = buildBlocks(text, format(text.length, [{ name: 'Target', cp: at }]));
    const [first, second] = blocks;
    expect(first?.kind === 'paragraph' && kinds(first.inlines)).toEqual(['See ', 'link #Target(here)', '.']);
    expect(second?.kind === 'paragraph' && kinds(second.inlines)).toEqual(['#Target', 'The target']);
  });

  it('splits the text where an anchor starts inside it', () => {
    const blocks = buildBlocks('abcdef\r', format(7, [{ name: 'mid', cp: 3 }]));
    expect(blocks[0]?.kind === 'paragraph' && kinds(blocks[0].inlines)).toEqual(['abc', '#mid', 'def']);
  });

  it('places an anchor that starts in a field instruction before the next shown text, outside the link', () => {
    const text = '\x13HYPERLINK "https://x.test/"\x14go\x15\r';
    const blocks = buildBlocks(text, format(text.length, [{ name: 'in', cp: 3 }]));
    expect(blocks[0]?.kind === 'paragraph' && kinds(blocks[0].inlines)).toEqual(['#in', 'link https://x.test/(go)']);
  });

  it('keeps an anchor on an empty paragraph, and ignores bookmarks it was not given', () => {
    const blocks = buildBlocks('\rnext\r', format(6, [{ name: 'empty', cp: 0 }]));
    expect(blocks[0]?.kind === 'paragraph' && kinds(blocks[0].inlines)).toEqual(['#empty']);
    const none = buildBlocks('\rnext\r', format(6, undefined));
    expect(none[0]?.kind === 'paragraph' && none[0].inlines).toEqual([]);
  });
});

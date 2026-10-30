import { describe, expect, it } from 'vitest';
import type { Block, Inline } from '../../model/document-model';
import { buildBlocks, type DocFormat } from './doc-paragraphs';
import { Sprm } from './doc-sprm';
import { createStyleSheet } from './doc-styles';

/** Paragraph text with [tab], [br] and {link: text} markers; page breaks are "---". */
function show(blocks: Block[]): string[] {
  const inlines = (list: Inline[]): string =>
    list
      .map((i) => {
        if (i.kind === 'text') return i.text;
        if (i.kind === 'lineBreak') return '[br]';
        if (i.kind === 'tab') return '[tab]';
        if (i.kind === 'link') return `{${i.href}: ${inlines(i.inlines)}}`;
        return `<${i.kind}>`;
      })
      .join('');
  return blocks.map((b) => (b.kind === 'paragraph' ? inlines(b.inlines) : '---'));
}

describe('buildBlocks', () => {
  it('ends a paragraph at 0x0D and keeps empty paragraphs', () => {
    expect(show(buildBlocks('one\r\rtwo\r'))).toEqual(['one', '', 'two']);
  });

  it('keeps a last paragraph that has no mark', () => {
    expect(show(buildBlocks('one\rtwo'))).toEqual(['one', 'two']);
    expect(buildBlocks('')).toEqual([]);
  });

  it('turns 0x0B and 0x09 into inlines', () => {
    expect(show(buildBlocks('a\x0bb\tc\r'))).toEqual(['a[br]b[tab]c']);
  });

  it('makes each cell a paragraph and leaves out the row-end mark', () => {
    expect(show(buildBlocks('A\x07B\x07\x07C\x07D\x07\x07after\r'))).toEqual(['A', 'B', 'C', 'D', 'after']);
  });

  it('ends the paragraph at 0x0C and adds a page break', () => {
    expect(show(buildBlocks('one\x0c\rtwo\r'))).toEqual(['one', '---', '', 'two']);
    expect(show(buildBlocks('one\r\x0ctwo\r'))).toEqual(['one', '---', 'two']);
    expect(buildBlocks('a\x0cb')).toEqual([
      { kind: 'paragraph', inlines: [{ kind: 'text', text: 'a' }] },
      { kind: 'pageBreak' },
      { kind: 'paragraph', inlines: [{ kind: 'text', text: 'b' }] },
    ]);
  });

  it('maps the non-breaking hyphen and drops the optional hyphen and unhandled control marks', () => {
    expect(show(buildBlocks('a\x1eb\x1fc\x01\x02\x05\x08d\x00e\r'))).toEqual(['a‑bcde']);
  });

  it('keeps text in other scripts unchanged', () => {
    expect(show(buildBlocks('हिन्दी বাংলা\r'))).toEqual(['हिन्दी বাংলা']);
  });

  it('builds links from hyperlink fields, with no instruction text', () => {
    const blocks = buildBlocks('See \x13HYPERLINK "https://x.test/"\x01\x14the\tsite\x0bnow\x15 ok\r');
    expect(show(blocks)).toEqual(['See {https://x.test/: the[tab]site[br]now} ok']);
  });

  it('shows other fields as their result', () => {
    expect(show(buildBlocks('Page \x13 PAGE \x147\x15 of \x13 NUMPAGES \x149\x15\r'))).toEqual(['Page 7 of 9']);
  });

  it('splits a link at a paragraph end inside its result', () => {
    expect(show(buildBlocks('\x13HYPERLINK "#a"\x14one\rtwo\x15\r'))).toEqual(['{#a: one}', '{#a: two}']);
  });

  it('starts a new link for a second field', () => {
    const blocks = buildBlocks('\x13HYPERLINK "#a"\x14x\x15 \x13HYPERLINK "#b"\x14y\x15\r');
    expect(show(blocks)).toEqual(['{#a: x} {#b: y}']);
  });
});

describe('buildBlocks with formatting', () => {
  const FC = 0x800;
  const fc = (cp: number) => FC + cp * 2;
  const bytes = (...values: number[]) => Uint8Array.from(values);
  const sprm = (id: number, ...operand: number[]) => [id & 0xff, id >> 8, ...operand];
  const normal = createStyleSheet([
    {
      istd: 0,
      sti: 0,
      kind: 'paragraph',
      name: 'Normal',
      paraGrpprl: new Uint8Array(0),
      // 11 pt, so runs carry only the marks a test sets.
      charGrpprl: bytes(...sprm(Sprm.CHps, 22, 0)),
    },
  ]);
  /** Character runs and paragraph runs by CP range, over one Unicode piece starting at CP 0. */
  function format(
    length: number,
    chars: [number, number, number[]][],
    paras: [number, number, number[]][] = [],
  ): DocFormat {
    const piece = { cpStart: 0, cpEnd: length, fc: FC, compressed: false, prm: 0 };
    return {
      text: { prcs: [], pieces: [piece], cpEnd: length, text: () => '', cpToFc: (cp) => fc(cp) },
      chpx: chars.map(([from, to, grpprl]) => ({ fcStart: fc(from), fcEnd: fc(to), grpprl: bytes(...grpprl) })),
      papx: paras.map(([from, to, grpprl]) => ({
        fcStart: fc(from),
        fcEnd: fc(to),
        grpprl: bytes(...grpprl),
        istd: 0,
      })),
      styles: normal,
      fonts: [],
    };
  }
  const runs = (blocks: Block[]) =>
    blocks.flatMap((b) =>
      b.kind === 'paragraph'
        ? b.inlines.map((i) => (i.kind === 'text' ? `${i.text}${i.marks?.bold ? '*' : ''}` : i.kind))
        : ['---'],
    );
  const BOLD = sprm(Sprm.CFBold, 1);

  it('splits runs at every change of character properties', () => {
    const blocks = buildBlocks(
      'one two\r',
      format(8, [
        [0, 4, []],
        [4, 7, BOLD],
        [7, 8, []],
      ]),
    );
    expect(runs(blocks)).toEqual(['one ', 'two*']);
  });

  it('keeps marks aligned with their characters across field instructions and dropped control characters', () => {
    const text = 'a\x13X\x14b\x15\x01c\r';
    const blocks = buildBlocks(
      text,
      format(text.length, [
        [0, 7, []],
        [7, 8, BOLD],
        [8, 9, []],
      ]),
    );
    expect(runs(blocks)).toEqual(['ab', 'c*']);
  });

  it('drops hidden text, tabs and line breaks, and a paragraph that is hidden entirely', () => {
    const text = 'a\tb\x0bc\rgone\rkept\r';
    const hidden = sprm(Sprm.CFVanish, 1);
    const blocks = buildBlocks(
      text,
      format(text.length, [
        [1, 2, hidden],
        [3, 4, hidden],
        [6, 11, hidden],
      ]),
    );
    expect(runs(blocks)).toEqual(['abc', 'kept']);
  });

  it('keeps an empty paragraph whose mark is not hidden', () => {
    const blocks = buildBlocks('gone\r', format(5, [[0, 4, sprm(Sprm.CFRMarkDel, 1)]]));
    expect(blocks).toEqual([{ kind: 'paragraph', inlines: [] }]);
  });

  it('adds a page break before a paragraph with sprmPFPageBreakBefore, but not at the start', () => {
    const pagebb = sprm(Sprm.PFPageBreakBefore, 1);
    const blocks = buildBlocks(
      'one\rtwo\r',
      format(
        8,
        [],
        [
          [0, 4, pagebb],
          [4, 8, pagebb],
        ],
      ),
    );
    expect(runs(blocks)).toEqual(['one', '---', 'two']);
  });

  it('puts paragraph properties on the paragraph found by its mark', () => {
    const blocks = buildBlocks('one\rtwo\r', format(8, [], [[4, 8, sprm(Sprm.PJc, 1)]]));
    expect(blocks.map((b) => (b.kind === 'paragraph' ? b.align : undefined))).toEqual([undefined, 'center']);
  });
});

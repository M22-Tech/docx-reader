import { describe, expect, it } from 'vitest';
import type { Block, Inline } from '../../model/document-model';
import { buildBlocks } from './doc-paragraphs';

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

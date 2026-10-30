import { describe, expect, it } from 'vitest';
import { resolveFields } from './doc-fields';

const B = '\x13';
const S = '\x14';
const E = '\x15';

describe('resolveFields', () => {
  it('passes text outside fields through', () => {
    expect(resolveFields('plain\r')).toEqual([{ text: 'plain\r' }]);
    expect(resolveFields('')).toEqual([]);
  });

  it('shows only the result of a field', () => {
    expect(resolveFields(`a${B} PAGE ${S}7${E}b`)).toEqual([{ text: 'a7b' }]);
    expect(resolveFields(`${B}PAGEREF _Toc1 \\h${S}12${E}`)).toEqual([{ text: '12' }]);
  });

  it('turns a HYPERLINK result into a link', () => {
    expect(resolveFields(`see ${B}HYPERLINK "https://example.com/a?b=1"${S}this${E} now`)).toEqual([
      { text: 'see ' },
      { text: 'this', href: 'https://example.com/a?b=1' },
      { text: ' now' },
    ]);
  });

  it('reads \\l as a bookmark, alone or after a URL', () => {
    expect(resolveFields(`${B} HYPERLINK \\l "section_2" ${S}go${E}`)).toEqual([{ text: 'go', href: '#section_2' }]);
    expect(resolveFields(`${B}HYPERLINK "http://x.test/p" \\l "top"${S}go${E}`)).toEqual([
      { text: 'go', href: 'http://x.test/p#top' },
    ]);
  });

  it('skips a tooltip switch and unescapes quoted text', () => {
    expect(resolveFields(`${B}HYPERLINK "C:\\\\docs\\\\a.txt" \\o "Open it"${S}file${E}`)).toEqual([
      { text: 'file', href: 'C:\\docs\\a.txt' },
    ]);
    expect(resolveFields(`${B}hyperlink http://x.test/ ${S}bare${E}`)).toEqual([
      { text: 'bare', href: 'http://x.test/' },
    ]);
  });

  it('ignores field data (0x01) inside the instruction', () => {
    expect(resolveFields(`${B}HYPERLINK "https://example.com/path?q=1"\x01${S}example.com${E}`)).toEqual([
      { text: 'example.com', href: 'https://example.com/path?q=1' },
    ]);
  });

  it('keeps a picture mark (0x01) in the shown result for the caller', () => {
    expect(resolveFields(`${B}INCLUDEPICTURE "x"${S}\x01${E}`)).toEqual([{ text: '\x01' }]);
  });

  it('shows nothing for a field with no separator', () => {
    expect(resolveFields(`a${B}XE "index entry"${E}b`)).toEqual([{ text: 'ab' }]);
    expect(resolveFields(`a${B}HYPERLINK "http://x.test"${E}b`)).toEqual([{ text: 'ab' }]);
  });

  it('shows no link for a HYPERLINK without a target', () => {
    expect(resolveFields(`${B}HYPERLINK ${S}text${E}`)).toEqual([{ text: 'text' }]);
    expect(resolveFields(`${B}HYPERLINK ""${S}text${E}`)).toEqual([{ text: 'text' }]);
  });

  it('handles a field nested in a result, keeping the link', () => {
    expect(resolveFields(`${B}HYPERLINK "#a"${S}Chapter ${B}PAGE${S}3${E} here${E}!`)).toEqual([
      { text: 'Chapter 3 here', href: '#a' },
      { text: '!' },
    ]);
  });

  it('lets the innermost link win', () => {
    expect(resolveFields(`${B}HYPERLINK "#outer"${S}a${B}HYPERLINK "#inner"${S}b${E}c${E}`)).toEqual([
      { text: 'a', href: '#outer' },
      { text: 'b', href: '#inner' },
      { text: 'c', href: '#outer' },
    ]);
  });

  it('handles a field nested in an instruction: its result joins the instruction', () => {
    expect(resolveFields(`${B}HYPERLINK "${B}REF x${S}http://x.test/${E}"${S}go${E}`)).toEqual([
      { text: 'go', href: 'http://x.test/' },
    ]);
  });

  it('shows nothing from a nested field without a separator inside a result', () => {
    expect(resolveFields(`${B}X${S}a${B}Y "hidden"${E}b${E}`)).toEqual([{ text: 'ab' }]);
  });

  it('drops unbalanced markers without throwing', () => {
    expect(resolveFields(`a${E}b`)).toEqual([{ text: 'ab' }]);
    expect(resolveFields(`a${S}b`)).toEqual([{ text: 'ab' }]);
    expect(resolveFields(`a${B}instruction only`)).toEqual([{ text: 'a' }]);
    expect(resolveFields(`${B}X${S}one${S}two${E}${E}end`)).toEqual([{ text: 'onetwoend' }]);
    expect(resolveFields(`${B}HYPERLINK "#a"${S}open result`)).toEqual([{ text: 'open result', href: '#a' }]);
  });
});

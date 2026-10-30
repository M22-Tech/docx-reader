import { describe, expect, it } from 'vitest';
import { hyperlinkOf } from './rtf-fields';

describe('hyperlinkOf', () => {
  it('reads the quoted url', () => {
    expect(hyperlinkOf(' HYPERLINK "https://example.com/path?q=1" ')).toBe('https://example.com/path?q=1');
  });

  it('reads an unquoted url', () => {
    expect(hyperlinkOf('HYPERLINK https://example.com')).toBe('https://example.com');
  });

  it('reads a bookmark with \\l, alone or after a url', () => {
    expect(hyperlinkOf('HYPERLINK \\l "chapter1"')).toBe('#chapter1');
    expect(hyperlinkOf('HYPERLINK "https://example.com/a" \\l "top"')).toBe('https://example.com/a#top');
  });

  it('skips the other switches and their arguments', () => {
    expect(hyperlinkOf('HYPERLINK "mailto:me@example.com" \\o "Tooltip text" \\t "_blank" \\n')).toBe(
      'mailto:me@example.com',
    );
  });

  it('is undefined for other fields and for an empty target', () => {
    expect(hyperlinkOf(' PAGE ')).toBeUndefined();
    expect(hyperlinkOf('TOC \\o "1-3"')).toBeUndefined();
    expect(hyperlinkOf('HYPERLINK')).toBeUndefined();
    expect(hyperlinkOf('HYPERLINK ""')).toBeUndefined();
  });

  it('matches the keyword in any case', () => {
    expect(hyperlinkOf('hyperlink "https://example.com"')).toBe('https://example.com');
  });
});

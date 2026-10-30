import { describe, expect, it } from 'vitest';
import { decodeHtml, htmlAdapter } from './html-adapter';

const ascii = (text: string) => new TextEncoder().encode(text);
const ctx = () => ({ signal: new AbortController().signal });

describe('decodeHtml', () => {
  it('reads UTF-8 by default', () => {
    expect(decodeHtml(ascii('<p>héllo €</p>'))).toBe('<p>héllo €</p>');
  });

  it('lets a UTF-8 byte-order mark win over a meta charset', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...ascii('<meta charset="windows-1252"><p>é</p>')]);
    expect(decodeHtml(bytes)).toBe('<meta charset="windows-1252"><p>é</p>');
  });

  it('reads UTF-16 with a byte-order mark', () => {
    const le = new Uint8Array([0xff, 0xfe, 0x3c, 0x00, 0x70, 0x00, 0x3e, 0x00, 0xe9, 0x00]);
    const be = new Uint8Array([0xfe, 0xff, 0x00, 0x3c, 0x00, 0x70, 0x00, 0x3e, 0x00, 0xe9]);
    expect(decodeHtml(le)).toBe('<p>é');
    expect(decodeHtml(be)).toBe('<p>é');
  });

  it('uses the meta charset', () => {
    const bytes = new Uint8Array([...ascii('<meta charset="windows-1252"><p>'), 0x80, 0xe9]);
    expect(decodeHtml(bytes)).toBe('<meta charset="windows-1252"><p>€é');
  });

  it('uses the charset of an http-equiv content type', () => {
    const head = '<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1"><p>';
    expect(decodeHtml(new Uint8Array([...ascii(head), 0xe9]))).toBe(`${head}é`);
  });

  it('falls back to UTF-8 for an unknown label or a UTF-16 label without a byte-order mark', () => {
    expect(decodeHtml(ascii('<meta charset="no-such-charset"><p>é'))).toBe('<meta charset="no-such-charset"><p>é');
    expect(decodeHtml(ascii('<meta charset="utf-16"><p>é'))).toBe('<meta charset="utf-16"><p>é');
  });

  it('ignores a charset declared after the first 2 KB', () => {
    const bytes = new Uint8Array([...ascii(`${' '.repeat(2100)}<meta charset="windows-1252"><p>`), 0xe9]);
    expect(decodeHtml(bytes)).toContain('�');
  });
});

describe('htmlAdapter', () => {
  it('is a Reading-only adapter', () => {
    expect(htmlAdapter.format).toBe('html');
    expect(htmlAdapter.modes).toEqual(['reading']);
    expect('renderLayout' in htmlAdapter).toBe(false);
  });

  it('returns the body wrapped in dr-reading, without the head', async () => {
    const html = await htmlAdapter.renderReading(
      ascii('<html><head><title>T</title></head><body><h1>Head</h1><p>Body</p></body></html>'),
      ctx(),
    );
    expect(html).toBe('<div class="dr-reading"><h1>Head</h1><p>Body</p></div>');
  });

  it('rejects when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(htmlAdapter.renderReading(ascii('<p>x</p>'), { signal: controller.signal })).rejects.toThrow();
  });
});

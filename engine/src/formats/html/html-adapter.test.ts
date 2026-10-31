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
  it('has both modes', () => {
    expect(htmlAdapter.format).toBe('html');
    expect(htmlAdapter.modes).toEqual(['raw', 'rendered']);
  });

  describe('renderRaw', () => {
    const render = async (text: string) => {
      const container = document.createElement('div');
      const result = await htmlAdapter.renderRaw?.(ascii(text), container, ctx());
      return { container, result };
    };

    it('shows markup as text, so nothing in it can run or load', async () => {
      const { container } = await render('<p>a</p><script>alert(1)</script><img src=x onerror="alert(2)">');
      expect(container.querySelectorAll('script, img, p')).toHaveLength(0);
      expect(container.querySelectorAll('*')).toHaveLength(1);
      expect(container.querySelector('pre.dr-source')?.textContent).toBe(
        '<p>a</p><script>alert(1)</script><img src=x onerror="alert(2)">',
      );
    });

    it('keeps the text exactly, including whitespace and non-Latin characters', async () => {
      const text = '<p>\n\t  two  spaces\r\n</p>\n\n  नमस्ते 世界 €\n';
      const { container } = await render(text);
      expect(container.querySelector('.dr-source')?.textContent).toBe(text);
    });

    it('returns no page width', async () => {
      const { result } = await render('<p>x</p>');
      expect(result?.pageWidthPx).toBeUndefined();
    });

    it('rejects when already aborted', async () => {
      const controller = new AbortController();
      controller.abort();
      await expect(
        htmlAdapter.renderRaw?.(ascii('<p>x</p>'), document.createElement('div'), { signal: controller.signal }),
      ).rejects.toThrow();
    });
  });

  it('returns the body wrapped in dr-rendered, without the head', async () => {
    const html = await htmlAdapter.renderRendered(
      ascii('<html><head><title>T</title></head><body><h1>Head</h1><p>Body</p></body></html>'),
      ctx(),
    );
    expect(html).toBe('<div class="dr-rendered"><h1>Head</h1><p>Body</p></div>');
  });

  it('rejects when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(htmlAdapter.renderRendered(ascii('<p>x</p>'), { signal: controller.signal })).rejects.toThrow();
  });
});

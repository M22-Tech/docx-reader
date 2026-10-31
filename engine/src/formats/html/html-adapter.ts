import type { FormatAdapter } from '../format-adapter';

// The charset declaration must be within the first 2 KB.
const META_HEAD_BYTES = 2048;
const META_CHARSET = /<meta\b[^>]*?charset\s*=\s*["']?\s*([^\s"';>/]+)/i;

/** Decodes an HTML file: a byte-order mark wins, then a `<meta>` charset in the first 2 KB, else UTF-8. */
export function decodeHtml(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  const head = new TextDecoder('windows-1252').decode(bytes.subarray(0, META_HEAD_BYTES));
  const label = META_CHARSET.exec(head)?.[1];
  return new TextDecoder(labelOrUtf8(label)).decode(bytes);
}

function labelOrUtf8(label: string | undefined): string {
  if (label === undefined) return 'utf-8';
  try {
    const { encoding } = new TextDecoder(label);
    // Without a byte-order mark a UTF-16 label cannot be right: the declaration itself was read as ASCII.
    return encoding.startsWith('utf-16') ? 'utf-8' : encoding;
  } catch {
    return 'utf-8';
  }
}

/** HTML (also saved with a `.doc`-style name): Raw shows the source text, Rendered the preview. */
export const htmlAdapter: FormatAdapter = {
  format: 'html',
  modes: ['raw', 'rendered'],
  renderRaw(bytes, container, ctx) {
    return new Promise((resolve) => {
      ctx.signal.throwIfAborted();
      // Built with text nodes only: the source never goes through an HTML parser or the sanitiser.
      const source = document.createElement('pre');
      source.className = 'dr-source';
      source.textContent = decodeHtml(bytes);
      container.replaceChildren(source);
      resolve({});
    });
  },
  renderRendered(bytes, ctx) {
    return new Promise((resolve) => {
      ctx.signal.throwIfAborted();
      const doc = new DOMParser().parseFromString(decodeHtml(bytes), 'text/html');
      resolve(`<div class="dr-rendered">${doc.body.innerHTML}</div>`);
    });
  },
};

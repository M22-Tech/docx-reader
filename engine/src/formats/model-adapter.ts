import type { DocumentModel } from '../model/document-model';
import { renderRaw as renderModelRaw } from '../model/render-raw';
import { renderRendered as renderModelRendered } from '../model/render-rendered';
import { sanitizeRaw } from '../sanitize/sanitize';
import type { Format, FormatAdapter } from './format-adapter';

/** An adapter with both modes for a format whose parser produces the document model; the bytes are parsed once. */
export function createModelAdapter(
  format: Format,
  parse: (bytes: Uint8Array, signal: AbortSignal) => Promise<DocumentModel>,
): FormatAdapter {
  let cached: { bytes: Uint8Array; model: Promise<DocumentModel> } | undefined;

  function load(bytes: Uint8Array, signal: AbortSignal): Promise<DocumentModel> {
    if (cached?.bytes === bytes) return cached.model;
    const model = parse(bytes, signal);
    cached = { bytes, model };
    // A failed parse is not kept, so the next call tries again.
    model.catch(() => {
      if (cached?.model === model) cached = undefined;
    });
    return model;
  }

  return {
    format,
    modes: ['raw', 'rendered'],
    async renderRaw(bytes, container, ctx) {
      const model = await load(bytes, ctx.signal);
      const { html, pageWidthPx } = renderModelRaw(model);
      container.innerHTML = sanitizeRaw(html);
      return { pageWidthPx };
    },
    async renderRendered(bytes, ctx) {
      return renderModelRendered(await load(bytes, ctx.signal));
    },
  };
}

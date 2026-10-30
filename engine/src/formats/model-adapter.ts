import type { DocumentModel } from '../model/document-model';
import { renderLayout as renderModelLayout } from '../model/render-layout';
import { renderReading as renderModelReading } from '../model/render-reading';
import { sanitizeLayout } from '../sanitize/sanitize';
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
    modes: ['layout', 'reading'],
    async renderLayout(bytes, container, ctx) {
      const model = await load(bytes, ctx.signal);
      const { html, pageWidthPx } = renderModelLayout(model);
      container.innerHTML = sanitizeLayout(html);
      return { pageWidthPx };
    },
    async renderReading(bytes, ctx) {
      return renderModelReading(await load(bytes, ctx.signal));
    },
  };
}

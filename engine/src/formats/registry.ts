import type { Format, FormatAdapter } from './format-adapter';
import { docxAdapter } from './docx/docx-adapter';
import { htmlAdapter } from './html/html-adapter';
import { createModelAdapter } from './model-adapter';
import { parseOdt } from './odt/parse-odt';

const adapters: Partial<Record<Format, FormatAdapter>> = {
  docx: docxAdapter,
  html: htmlAdapter,
  odt: createModelAdapter('odt', parseOdt),
};

/** The adapter for a format, or undefined while that format's adapter doesn't exist yet. */
export function adapterFor(format: Format): FormatAdapter | undefined {
  return adapters[format];
}

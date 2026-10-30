import type { Format, FormatAdapter } from './format-adapter';
import { htmlAdapter } from './html/html-adapter';

const adapters: Partial<Record<Format, FormatAdapter>> = {
  html: htmlAdapter,
};

/** The adapter for a format, or undefined while that format's adapter doesn't exist yet. */
export function adapterFor(format: Format): FormatAdapter | undefined {
  return adapters[format];
}

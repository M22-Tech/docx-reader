import { LARGE_FILE_WARNING_MB } from '../config/constants';
import { formatSize } from '../modules/recent/format-recent';

/** The line under the spinner for a large file, or null for a normal one (docs/spec/01-opening-files.md, Large files). */
export function largeFileLine(sizeBytes: number): string | null {
  if (sizeBytes <= LARGE_FILE_WARNING_MB * 1024 * 1024) return null;
  return `This is a large file (${formatSize(sizeBytes)}), so it may take a while to open.`;
}

/** Whether a failure to read the copy looks like running out of memory. */
export function looksLikeOutOfMemory(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /out\s*of\s*memory|OutOfMemory|OOM|allocation|heap/i.test(text);
}

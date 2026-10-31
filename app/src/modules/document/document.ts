import { FALLBACK_EXTENSION } from '../../config/constants';

/** A document the app holds a private copy of. */
export interface OpenedDocument {
  id: string;
  name: string;
  sizeBytes: number;
  /** URI of the private copy. */
  path: string;
}

/** The extension of a file name, lowercase, without the dot; `bin` when there is none or it isn't plain letters and digits. */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return FALLBACK_EXTENSION;
  const extension = name.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]{1,10}$/.test(extension) ? extension : FALLBACK_EXTENSION;
}

/** The documents opened with recent files off, by id, so the viewer can find their copy. */
const unkept = new Map<string, OpenedDocument>();

export function rememberUnkept(document: OpenedDocument): void {
  unkept.set(document.id, document);
}

export function findUnkept(id: string): OpenedDocument | undefined {
  return unkept.get(id);
}

import { FALLBACK_DOCUMENT_NAME } from '../../config/constants';
import { logger } from '../../logger';
import { addRecent } from '../recent/recent-store';
import { extensionOf, rememberUnkept, type OpenedDocument } from './document';
import { copyToStore, deleteFile, newId, sha256Of, sourceInfo } from './document-files';
import { openError, type OpenError } from './open-error';

export interface OpenRequest {
  /** Where the document is: a `content://` or `file://` URI. */
  uri: string;
  /** The name the source gave (the picker's); the file's own name is used when missing. */
  name?: string | null;
}

export type OpenResult = { ok: true; document: OpenedDocument } | { ok: false; error: OpenError };

/**
 * The flow behind Open file, Open with and Share: copy first, then the rest. With `keepRecent` the copy goes to
 * the recent folder and into the list, else to the cache folder and nowhere else.
 */
export async function openDocument(request: OpenRequest, keepRecent: boolean): Promise<OpenResult> {
  const started = performance.now();
  let name = request.name?.trim() || '';
  let sizeBytes: number | null;
  try {
    const source = sourceInfo(request.uri);
    name = name || source.displayName?.trim() || FALLBACK_DOCUMENT_NAME;
    sizeBytes = source.sizeBytes;
  } catch (error) {
    logger.warn('reading the source failed', error);
    return { ok: false, error: openError('read_failed', name || FALLBACK_DOCUMENT_NAME) };
  }
  if (sizeBytes === 0) return { ok: false, error: openError('empty', name) };

  const id = newId();
  const folder = keepRecent ? 'recent' : 'open';
  let path: string | null = null;
  try {
    const copy = await copyToStore(request.uri, folder, `${id}.${extensionOf(name)}`);
    path = copy.uri;
    if (copy.sizeBytes === 0) {
      deleteFile(path);
      return { ok: false, error: openError('empty', name) };
    }
    const sha256 = await sha256Of(path);
    logger.debug('copy', {
      name,
      sizeBytes: copy.sizeBytes,
      durationMs: Number((performance.now() - started).toFixed(3)),
    });

    if (!keepRecent) {
      const document = { id, name, sizeBytes: copy.sizeBytes, path };
      rememberUnkept(document);
      return { ok: true, document };
    }
    const entry = await addRecent({ id, name, sizeBytes: copy.sizeBytes, sha256, openedAt: Date.now(), path });
    return { ok: true, document: { id: entry.id, name: entry.name, sizeBytes: entry.sizeBytes, path: entry.path } };
  } catch (error) {
    logger.warn('copying the document failed', error);
    if (path) deleteFile(path);
    return { ok: false, error: openError('read_failed', name) };
  }
}

/**
 * Copies the other files of a share into recent files. Failures are logged and skipped; with recent files off
 * nothing is copied, since there is no list to add them to.
 */
export async function addToRecent(requests: OpenRequest[], keepRecent: boolean): Promise<void> {
  if (!keepRecent) return;
  for (const request of requests) {
    const result = await openDocument(request, true);
    if (!result.ok) logger.warn('adding a shared file failed', result.error.code);
  }
}

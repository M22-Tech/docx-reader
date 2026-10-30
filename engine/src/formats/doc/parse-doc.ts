import { DocumentError } from '../../document-error';
import { timed } from '../../logger';
import type { DocumentModel } from '../../model/document-model';
import { openDocContainer } from './doc-container';
import { FcLcb, readFib } from './doc-fib';
import { buildBlocks } from './doc-paragraphs';
import { readDocText } from './doc-text';

/** Parses a Word 97 to 2003 file into the document model. */
export async function parseDoc(bytes: Uint8Array, signal: AbortSignal): Promise<DocumentModel> {
  return timed('doc parse', () => {
    signal.throwIfAborted();
    const { fibBase, wordDocument, table } = openDocContainer(bytes);
    signal.throwIfAborted();
    const fib = readFib(wordDocument, table.length, fibBase);
    const clx = fib.pair(FcLcb.Clx);
    if (!clx) throw new DocumentError('corrupt', 'The file has no Clx.');
    const text = readDocText(wordDocument, table, clx);
    signal.throwIfAborted();
    return { blocks: buildBlocks(text.text(0, fib.ccpText)), notes: [] };
  });
}

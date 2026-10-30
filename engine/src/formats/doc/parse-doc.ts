import { DocumentError } from '../../document-error';
import { timed } from '../../logger';
import type { DocumentModel } from '../../model/document-model';
import { openDocContainer } from './doc-container';
import { FcLcb, readFib } from './doc-fib';
import { readChpxRuns, readPapxRuns } from './doc-fkp';
import { readFontNames } from './doc-fonts';
import { readBookmarks } from './doc-bookmarks';
import { readListTables } from './doc-lists';
import { buildNotes, readNoteTables } from './doc-notes';
import { buildBlocks } from './doc-paragraphs';
import { readPageSetup } from './doc-section';
import { createStyleSheet, readStyleSheet } from './doc-styles';
import { readDocText } from './doc-text';

/** Parses a Word 97 to 2003 file into the document model. */
export async function parseDoc(bytes: Uint8Array, signal: AbortSignal): Promise<DocumentModel> {
  return timed('doc parse', () => {
    signal.throwIfAborted();
    const { fibBase, wordDocument, table, data } = openDocContainer(bytes);
    signal.throwIfAborted();
    const fib = readFib(wordDocument, table.length, fibBase);
    const clx = fib.pair(FcLcb.Clx);
    if (!clx) throw new DocumentError('corrupt', 'The file has no Clx.');
    const text = readDocText(wordDocument, table, clx);
    signal.throwIfAborted();

    const chpxPair = fib.pair(FcLcb.PlcfBteChpx);
    const papxPair = fib.pair(FcLcb.PlcfBtePapx);
    const stshPair = fib.pair(FcLcb.Stshf);
    const fontsPair = fib.pair(FcLcb.SttbfFfn);
    const sedPair = fib.pair(FcLcb.PlcfSed);
    const format = {
      text,
      chpx: chpxPair ? readChpxRuns(wordDocument, table, chpxPair) : [],
      papx: papxPair ? readPapxRuns(wordDocument, table, papxPair) : [],
      styles: stshPair ? readStyleSheet(table, stshPair) : createStyleSheet([]),
      fonts: fontsPair ? readFontNames(table, fontsPair) : [],
      lists: readListTables(table, fib.pair(FcLcb.PlfLst), fib.pair(FcLcb.PlfLfo)),
      ...(data ? { data } : {}),
    };
    const noteTables = readNoteTables(table, fib, text);
    const bookmarks = readBookmarks(table, fib.pair(FcLcb.SttbfBkmk), fib.pair(FcLcb.PlcfBkf));
    signal.throwIfAborted();

    const page = sedPair ? readPageSetup(wordDocument, table, sedPair) : undefined;
    // Bookmarks and note references belong to the main text; the notes are built without them.
    const blocks = buildBlocks(text.text(0, fib.ccpText), {
      ...format,
      noteRefs: noteTables.refs,
      bookmarks: bookmarks.filter((bookmark) => bookmark.cp < fib.ccpText),
    });
    signal.throwIfAborted();
    return { ...(page ? { page } : {}), blocks, notes: buildNotes(noteTables.notes, text, format) };
  });
}

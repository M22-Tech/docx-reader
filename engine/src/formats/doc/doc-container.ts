import * as CFB from 'cfb';
import { DocumentError } from '../../document-error';
import { readFibBase, type FibBase } from './doc-fib';

/** The streams of a doc file that the parser reads. */
export interface DocContainer {
  fibBase: FibBase;
  wordDocument: Uint8Array;
  table: Uint8Array;
  /** Pictures; absent when the file has no `Data` stream. */
  data?: Uint8Array;
}

function stream(container: CFB.CFB$Container, name: string): Uint8Array | undefined {
  const entry = CFB.find(container, `/${name}`);
  if (!entry) return undefined;
  const content = entry.content;
  return content instanceof Uint8Array ? content : Uint8Array.from(content);
}

/** Opens the compound file; checks the FIB base first so Word 95 and encrypted files get their own errors. */
export function openDocContainer(bytes: Uint8Array): DocContainer {
  let container: CFB.CFB$Container;
  try {
    container = CFB.read(bytes, { type: 'array' });
  } catch (cause) {
    throw new DocumentError('corrupt', 'The compound file cannot be read.', { cause });
  }
  const wordDocument = stream(container, 'WordDocument');
  if (!wordDocument) throw new DocumentError('corrupt', 'The file has no WordDocument stream.');
  const fibBase = readFibBase(wordDocument);
  const tableName = fibBase.whichTableStream === 1 ? '1Table' : '0Table';
  const table = stream(container, tableName);
  if (!table) throw new DocumentError('corrupt', `The file has no ${tableName} stream.`);
  const data = stream(container, 'Data');
  return { fibBase, wordDocument, table, ...(data ? { data } : {}) };
}

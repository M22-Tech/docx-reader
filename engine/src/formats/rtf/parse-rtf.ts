import { DocumentError } from '../../document-error';
import { timed } from '../../logger';
import type { DocumentModel } from '../../model/document-model';
import { RtfInterpreter } from './rtf-interpreter';

const SIGNATURE = [0x7b, 0x5c, 0x72, 0x74, 0x66]; // {\rtf

/** True when the bytes start with `{\rtf` after optional white space and a byte-order mark. */
function startsWithRtf(bytes: Uint8Array): boolean {
  let pos = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) pos = 3;
  while (pos < bytes.length && [0x20, 0x09, 0x0a, 0x0d].includes(bytes[pos] as number)) pos++;
  return SIGNATURE.every((byte, i) => bytes[pos + i] === byte);
}

/** Parses an RTF file into the document model. */
export async function parseRtf(bytes: Uint8Array, signal: AbortSignal): Promise<DocumentModel> {
  signal.throwIfAborted();
  if (!startsWithRtf(bytes)) throw new DocumentError('corrupt', 'The file does not start with {\\rtf.');
  return timed('rtf parse', () => new RtfInterpreter().run(bytes, signal));
}

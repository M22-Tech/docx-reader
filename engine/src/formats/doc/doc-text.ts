import { DocumentError } from '../../document-error';
import { DocReader } from './doc-reader';
import type { FcLcbPair } from './doc-fib';

const CLXT_PRC = 0x01;
const CLXT_PCDT = 0x02;
const F_COMPRESSED = 0x40000000;
const FC_MASK = 0x3fffffff;
const PCD_SIZE = 8;

const windows1252 = new TextDecoder('windows-1252');

/** One piece of the document's text: a CP range stored at one place in `WordDocument`. */
export interface Piece {
  cpStart: number;
  cpEnd: number;
  /** Byte offset of the piece's first character in `WordDocument`. */
  fc: number;
  /** True for 8-bit Windows-1252 text, false for UTF-16LE. */
  compressed: boolean;
  /** The piece's `Prm`: sprms that apply to all its text. */
  prm: number;
}

/** The text structure of a document. A CP is a UTF-16 unit, so CPs are indexes into the strings `text` returns. */
export interface DocText {
  /** The `grpprl` of each `Prc` in the `Clx`, in order (a `Prm1` indexes them). */
  prcs: Uint8Array[];
  pieces: readonly Piece[];
  /** The CP after the last piece's text. */
  cpEnd: number;
  /** The text of CPs `[cpStart, cpEnd)`. */
  text(cpStart: number, cpEnd: number): string;
  /** The byte offset in `WordDocument` of a CP, or undefined when the CP is outside the pieces. */
  cpToFc(cp: number): number | undefined;
}

/** Reads the `Clx` and builds the piece table over `wordDocument`. */
export function readDocText(wordDocument: Uint8Array, table: Uint8Array, clx: FcLcbPair): DocText {
  const reader = new DocReader(table);
  const end = clx.fc + clx.lcb;
  const prcs: Uint8Array[] = [];
  let pos = clx.fc;
  let pieces: Piece[] | undefined;

  while (pos < end && !pieces) {
    const clxt = reader.u8(pos);
    if (clxt === CLXT_PRC) {
      const size = reader.i16(pos + 1);
      if (size < 0 || pos + 3 + size > end) throw new DocumentError('corrupt', 'A Prc in the Clx is malformed.');
      prcs.push(reader.bytes(pos + 3, size));
      pos += 3 + size;
    } else if (clxt === CLXT_PCDT) {
      const size = reader.u32(pos + 1);
      if (pos + 5 + size > end) throw new DocumentError('corrupt', 'The Pcdt in the Clx is malformed.');
      pieces = readPieces(reader, pos + 5, size, wordDocument.length);
    } else {
      throw new DocumentError('corrupt', `The Clx has an unknown entry type ${clxt}.`);
    }
  }
  if (!pieces) throw new DocumentError('corrupt', 'The Clx has no piece table.');

  const characters = new DocReader(wordDocument);
  const cpEnd = pieces.length > 0 ? (pieces[pieces.length - 1] as Piece).cpEnd : 0;

  function pieceAt(cp: number): Piece | undefined {
    let low = 0;
    let high = pieces!.length - 1;
    let found: Piece | undefined;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const piece = pieces![mid] as Piece;
      if (piece.cpStart <= cp) {
        found = piece;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return found && cp < found.cpEnd ? found : undefined;
  }

  return {
    prcs,
    pieces,
    cpEnd,
    cpToFc(cp) {
      const piece = pieceAt(cp);
      if (!piece) return undefined;
      return piece.fc + (cp - piece.cpStart) * (piece.compressed ? 1 : 2);
    },
    text(cpStart, cpEndWanted) {
      if (!(cpStart >= 0 && cpStart <= cpEndWanted && cpEndWanted <= cpEnd)) {
        throw new DocumentError('corrupt', `The text range ${cpStart} to ${cpEndWanted} is outside the document.`);
      }
      const parts: string[] = [];
      for (const piece of pieces) {
        const from = Math.max(cpStart, piece.cpStart);
        const to = Math.min(cpEndWanted, piece.cpEnd);
        if (from >= to) continue;
        const at = piece.fc + (from - piece.cpStart) * (piece.compressed ? 1 : 2);
        parts.push(
          piece.compressed ? windows1252.decode(characters.bytes(at, to - from)) : characters.utf16(at, to - from),
        );
      }
      return parts.join('');
    },
  };
}

/** Reads a `PlcPcd`: n + 1 CPs, then n 8-byte `Pcd`s. */
function readPieces(reader: DocReader, at: number, size: number, streamLength: number): Piece[] {
  if (size < 4 || (size - 4) % (4 + PCD_SIZE) !== 0) throw new DocumentError('corrupt', 'The PlcPcd has a bad size.');
  const count = (size - 4) / (4 + PCD_SIZE);
  const pcdAt = at + (count + 1) * 4;
  const pieces: Piece[] = [];
  let previous = reader.u32(at);
  if (previous !== 0) throw new DocumentError('corrupt', 'The piece table does not start at CP 0.');
  for (let i = 0; i < count; i++) {
    const cpStart = previous;
    const cpEnd = reader.u32(at + (i + 1) * 4);
    if (cpEnd < cpStart) throw new DocumentError('corrupt', 'The piece table CPs are not in order.');
    previous = cpEnd;
    const rawFc = reader.u32(pcdAt + i * PCD_SIZE + 2);
    const compressed = (rawFc & F_COMPRESSED) !== 0;
    const fc = compressed ? (rawFc & FC_MASK) >>> 1 : rawFc & FC_MASK;
    const byteLength = (cpEnd - cpStart) * (compressed ? 1 : 2);
    if (byteLength > 0 && fc + byteLength > streamLength) {
      throw new DocumentError('corrupt', 'A piece lies outside the WordDocument stream.');
    }
    pieces.push({ cpStart, cpEnd, fc, compressed, prm: reader.u16(pcdAt + i * PCD_SIZE + 6) });
  }
  return pieces;
}

import type { FcLcbPair } from './doc-fib';
import { DocReader } from './doc-reader';

/** Bytes of an `FFN` before the name: `cbFfnM1`, flags, weight, charset, alt-name index, panose and font signature. */
const FFN_FIXED = 40;

/** Reads the `SttbfFfn` (a count, `cbExtra`, then the `FFN`s) into font names by index. A damaged entry ends the list. */
export function readFontNames(table: Uint8Array, pair: FcLcbPair): string[] {
  const reader = new DocReader(table);
  const end = pair.fc + pair.lcb;
  const count = reader.u16(pair.fc);
  let at = pair.fc + 4 + reader.u16(pair.fc + 2);
  const names: string[] = [];
  for (let i = 0; i < count && at < end; i++) {
    const size = reader.u8(at) + 1;
    if (size < FFN_FIXED || at + size > end) break;
    const characters = Math.floor((size - FFN_FIXED) / 2);
    let name = reader.utf16(at + FFN_FIXED, characters);
    const terminator = name.indexOf('\0');
    if (terminator >= 0) name = name.slice(0, terminator);
    names.push(name);
    at += size;
  }
  return names;
}

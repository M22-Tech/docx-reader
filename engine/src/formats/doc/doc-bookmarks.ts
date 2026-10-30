import type { FcLcbPair } from './doc-fib';
import { DocReader } from './doc-reader';

const STTB_EXTENDED = 0xffff;
const STTB_HEADER_SIZE = 6;
const BKF_SIZE = 4;

/** A bookmark name and the CP where the bookmark starts. */
export interface Bookmark {
  name: string;
  cp: number;
}

/**
 * Reads the bookmarks from `SttbfBkmk` (the names) and `PlcfBkf` (the start CPs, in the same order), sorted by CP. A name
 * with no start, an empty name and a repeated name are left out; damaged tables give the bookmarks read before the damage.
 */
export function readBookmarks(
  table: Uint8Array,
  names: FcLcbPair | undefined,
  starts: FcLcbPair | undefined,
): Bookmark[] {
  if (!names || !starts || names.lcb < STTB_HEADER_SIZE || starts.lcb < 4) return [];
  const reader = new DocReader(table);
  if (reader.u16(names.fc) !== STTB_EXTENDED) return [];
  const namesEnd = names.fc + names.lcb;
  const count = Math.min(reader.u16(names.fc + 2), Math.floor((starts.lcb - 4) / (4 + BKF_SIZE)));
  const extra = reader.u16(names.fc + 4);

  const bookmarks: Bookmark[] = [];
  const seen = new Set<string>();
  let at = names.fc + STTB_HEADER_SIZE;
  for (let i = 0; i < count; i++) {
    if (at + 2 > namesEnd) break;
    const length = reader.u16(at);
    if (at + 2 + length * 2 + extra > namesEnd) break;
    const name = reader.utf16(at + 2, length);
    at += 2 + length * 2 + extra;
    if (name === '' || seen.has(name)) continue;
    seen.add(name);
    bookmarks.push({ name, cp: reader.u32(starts.fc + i * 4) });
  }
  return bookmarks.sort((a, b) => a.cp - b.cp);
}

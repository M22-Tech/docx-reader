import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as CFB from 'cfb';

export const fixture = (name: string) =>
  new Uint8Array(readFileSync(resolve(import.meta.dirname, '../../../../fixtures', name)));

export const signal = () => new AbortController().signal;

/** Byte offsets in `WordDocument` that tests edit. */
export const FIB_OFFSET = { nFib: 2, flags: 10, clxLcb: 154 + 33 * 8 + 4 } as const;

/** A copy of a compound file with some of its streams changed (`null` removes one). */
export function editStreams(
  bytes: Uint8Array,
  edits: Record<string, ((stream: Uint8Array) => void) | null>,
): Uint8Array {
  const container = CFB.read(bytes, { type: 'array' });
  for (const [name, edit] of Object.entries(edits)) {
    const entry = CFB.find(container, `/${name}`);
    if (!entry) throw new Error(`no stream ${name}`);
    CFB.utils.cfb_del(container, `/${name}`);
    if (!edit) continue;
    const content = Uint8Array.from(entry.content);
    edit(content);
    CFB.utils.cfb_add(container, `/${name}`, content);
  }
  return new Uint8Array(CFB.write(container, { type: 'array' }) as ArrayBuffer);
}

export function setU16(stream: Uint8Array, at: number, value: number): void {
  new DataView(stream.buffer, stream.byteOffset).setUint16(at, value, true);
}

export function setU32(stream: Uint8Array, at: number, value: number): void {
  new DataView(stream.buffer, stream.byteOffset).setUint32(at, value, true);
}

/** One piece for `clxOf`: its length in characters and its raw `Pcd.fc` (bit 30 set for compressed text). */
export interface PieceSpec {
  length: number;
  rawFc: number;
  prm?: number;
}

/** A `Clx` holding the given `Prc` grpprls, then a `Pcdt` with the given pieces. */
export function clxOf(pieces: PieceSpec[], prcs: number[][] = []): Uint8Array {
  const out: number[] = [];
  const u16 = (v: number) => out.push(v & 0xff, (v >> 8) & 0xff);
  const u32 = (v: number) => out.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
  for (const prc of prcs) {
    out.push(0x01);
    u16(prc.length);
    out.push(...prc);
  }
  out.push(0x02);
  u32(pieces.length * 12 + 4);
  let cp = 0;
  u32(cp);
  for (const piece of pieces) u32((cp += piece.length));
  for (const piece of pieces) {
    u16(0);
    u32(piece.rawFc);
    u16(piece.prm ?? 0);
  }
  return Uint8Array.from(out);
}

/** The raw `Pcd.fc` of a compressed piece whose first character is at byte `offset`. */
export const compressedFc = (offset: number) => (offset * 2) | 0x40000000;

export const bytesOf16 = (text: string) => {
  const out = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) new DataView(out.buffer).setUint16(i * 2, text.charCodeAt(i), true);
  return out;
};

/** An OfficeArt record: version and instance, type, length, then the body. */
export function officeArtRecord(version: number, instance: number, type: number, body: ArrayLike<number>): Uint8Array {
  const out = new Uint8Array(8 + body.length);
  const view = new DataView(out.buffer);
  view.setUint16(0, (instance << 4) | version, true);
  view.setUint16(2, type, true);
  view.setUint32(4, body.length, true);
  out.set(body, 8);
  return out;
}

/** A BLIP record whose body is `uids` 16-byte UIDs (filled with 0xAA), a tag byte and the image. */
export function blipRecord(type: number, instance: number, uids: number, image: ArrayLike<number>): Uint8Array {
  return officeArtRecord(0, instance, type, [...new Array<number>(uids * 16).fill(0xaa), 0xff, ...Array.from(image)]);
}

export interface PictureSpec {
  /** The record that holds the image; absent for a picture whose `PICF` has no OfficeArt data after it. */
  blip?: Uint8Array;
  mm?: number;
  dxaGoal?: number;
  dyaGoal?: number;
  mx?: number;
  my?: number;
  /** Written after the header when `mm` is 0x66. */
  name?: string;
  /** Overrides the `lcb` the structure states. */
  lcb?: number;
}

/** A `PICFAndOfficeArtData`: a `PICF`, an optional name, a shape container and an `OfficeArtFBSE` holding the BLIP. */
export function pictureData(spec: PictureSpec): Uint8Array {
  const mm = spec.mm ?? 0x64;
  const name = [...(spec.name ?? '')].map((c) => c.charCodeAt(0));
  const after: number[] = mm === 0x66 ? [name.length, ...name] : [];
  if (spec.blip) {
    const container = officeArtRecord(0xf, 0, 0xf004, officeArtRecord(2, 0xa, 0xf00a, [0, 0, 0, 0, 0, 0, 0, 0]));
    const fbse = officeArtRecord(2, 6, 0xf007, [...new Array<number>(33).fill(0), 0, 0, 0, ...spec.blip]);
    after.push(...container, ...fbse);
  }
  const out = new Uint8Array(68 + after.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, spec.lcb ?? out.length, true);
  view.setUint16(4, 68, true);
  view.setUint16(6, mm, true);
  view.setUint16(28, spec.dxaGoal ?? 3600, true);
  view.setUint16(30, spec.dyaGoal ?? 1800, true);
  view.setUint16(32, spec.mx ?? 1000, true);
  view.setUint16(34, spec.my ?? 1000, true);
  out.set(after, 68);
  return out;
}

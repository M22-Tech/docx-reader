import type { ImageInline } from '../../model/document-model';
import { twipsToPx } from '../shared/units';

export type PictureKind = 'png' | 'jpeg' | 'dib' | 'metafile' | 'other';

/** What `\pict` collects: the format keyword, the size words and the data pieces. */
export interface PictureDraft {
  kind: PictureKind;
  /** `\picwgoal` and `\pichgoal`, twips. */
  widthGoal?: number;
  heightGoal?: number;
  /** `\picw` and `\pich`: pixels for bitmaps, 0.01 mm for metafiles. */
  width?: number;
  height?: number;
  /** `\picscalex` and `\picscaley`, percent. */
  scaleX: number;
  scaleY: number;
  chunks: { hex: boolean; data: Uint8Array }[];
}

export function newPictureDraft(): PictureDraft {
  return { kind: 'other', scaleX: 100, scaleY: 100, chunks: [] };
}

/** Picture keywords that set the kind. */
export function pictureKind(word: string): PictureKind | undefined {
  switch (word) {
    case 'pngblip':
      return 'png';
    case 'jpegblip':
      return 'jpeg';
    case 'dibitmap':
      return 'dib';
    case 'wmetafile':
    case 'emfblip':
    case 'pmmetafile':
    case 'macpict':
      return 'metafile';
    case 'wbitmap':
      return 'other';
    default:
      return undefined;
  }
}

const HEX = new Int8Array(256).fill(-1);
for (let i = 0; i < 10; i++) HEX[0x30 + i] = i;
for (let i = 0; i < 6; i++) {
  HEX[0x41 + i] = 10 + i;
  HEX[0x61 + i] = 10 + i;
}

/** Hex digits to bytes; anything that is not a hex digit (white space) is ignored, and an odd last digit is dropped. */
export function decodeHex(chunks: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const chunk of chunks) total += chunk.length;
  const out = new Uint8Array(total >> 1);
  let length = 0;
  let high = -1;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) {
      const value = HEX[chunk[i] as number] as number;
      if (value < 0) continue;
      if (high < 0) {
        high = value;
      } else {
        out[length++] = high * 16 + value;
        high = -1;
      }
    }
  }
  return out.subarray(0, length);
}

/** The picture's bytes: hex chunks decoded, `\bin` chunks as they are. */
function pictureBytes(chunks: PictureDraft['chunks']): Uint8Array {
  const pieces: Uint8Array[] = [];
  let hexRun: Uint8Array[] = [];
  for (const chunk of chunks) {
    if (chunk.hex) {
      hexRun.push(chunk.data);
    } else {
      if (hexRun.length) pieces.push(decodeHex(hexRun));
      hexRun = [];
      pieces.push(chunk.data);
    }
  }
  if (hexRun.length) pieces.push(decodeHex(hexRun));
  if (pieces.length === 1) return pieces[0] as Uint8Array;
  const out = new Uint8Array(pieces.reduce((sum, piece) => sum + piece.length, 0));
  let offset = 0;
  for (const piece of pieces) {
    out.set(piece, offset);
    offset += piece.length;
  }
  return out;
}

/** A device-independent bitmap (what `\dibitmap` holds) with the 14-byte file header a BMP file starts with. */
export function dibToBmp(dib: Uint8Array): Uint8Array | undefined {
  if (dib.length < 40) return undefined;
  const view = new DataView(dib.buffer, dib.byteOffset, dib.byteLength);
  const headerSize = view.getUint32(0, true);
  if (headerSize < 40 || headerSize > dib.length) return undefined;
  const bitCount = view.getUint16(14, true);
  const compression = view.getUint32(16, true);
  const colorsUsed = view.getUint32(32, true);
  const colors = colorsUsed || (bitCount <= 8 ? 1 << bitCount : 0);
  // BI_BITFIELDS stores three colour masks after a 40-byte header.
  const masks = compression === 3 && headerSize === 40 ? 12 : 0;
  const offset = 14 + headerSize + masks + colors * 4;
  const out = new Uint8Array(14 + dib.length);
  const header = new DataView(out.buffer);
  out[0] = 0x42;
  out[1] = 0x4d;
  header.setUint32(2, out.length, true);
  header.setUint32(10, offset, true);
  out.set(dib, 14);
  return out;
}

const round = (value: number) => Math.round(value * 1000) / 1000;

/** Pixel size from the goal (twips), else `\picw`/`\pich`, then the scale. */
function sizeOf(draft: PictureDraft): { widthPx: number; heightPx: number } {
  const fromUnits = (goal: number | undefined, size: number | undefined) => {
    if (goal !== undefined && goal > 0) return twipsToPx(goal);
    if (size !== undefined && size > 0) return draft.kind === 'metafile' ? (size * 96) / 2540 : size;
    return 0;
  };
  return {
    widthPx: round((fromUnits(draft.widthGoal, draft.width) * draft.scaleX) / 100),
    heightPx: round((fromUnits(draft.heightGoal, draft.height) * draft.scaleY) / 100),
  };
}

/** The image for a finished `\pict`: PNG, JPEG and BMP show; anything else keeps its size and has no `src`. */
export function pictureToImage(draft: PictureDraft): ImageInline {
  const size = sizeOf(draft);
  const image: ImageInline = { kind: 'image', widthPx: size.widthPx, heightPx: size.heightPx };
  if (draft.kind !== 'png' && draft.kind !== 'jpeg' && draft.kind !== 'dib') return image;
  const data = pictureBytes(draft.chunks);
  if (draft.kind === 'dib') {
    const bmp = dibToBmp(data);
    if (bmp) image.src = { mime: 'image/bmp', data: bmp };
  } else if (data.length > 0) {
    image.src = { mime: draft.kind === 'png' ? 'image/png' : 'image/jpeg', data };
  }
  return image;
}

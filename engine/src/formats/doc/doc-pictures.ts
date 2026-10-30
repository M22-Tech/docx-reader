import type { ImageInline } from '../../model/document-model';
import { twipsToPx } from '../shared/units';
import { dibToBmp } from '../rtf/rtf-pictures';
import { DocReader } from './doc-reader';

/** `PICF.cbHeader` is always 68; the fields below sit at these offsets of the `PICF`. */
const PICF_HEADER_SIZE = 68;
const PICF_MM = 6;
const PICF_DXA_GOAL = 28;
const PICF_DYA_GOAL = 30;
const PICF_MX = 32;
const PICF_MY = 34;

/** `mfpf.mm`: an OfficeArt shape follows, with the picture name in front when the value is `MM_SHAPEFILE`. */
const MM_SHAPE = 0x0064;
const MM_SHAPEFILE = 0x0066;

const RECORD_HEADER_SIZE = 8;
const FBSE = 0xf007;
const FBSE_FIXED_SIZE = 36;
const FBSE_NAME_LENGTH = 33;
const CONTAINER_VERSION = 0xf;
const UID_SIZE = 16;

const JPEG = new Set([0xf01d, 0xf02a]);
const PNG = 0xf01e;
const DIB = 0xf01f;
/** EMF, WMF and TIFF: found, but not shown. */
const OTHER_BLIPS = new Set([0xf01a, 0xf01b, 0xf029]);

const round = (value: number) => Math.round(value * 1000) / 1000;

/** What a walk over the OfficeArt records found: the image, or `undefined` for a BLIP the viewer cannot show. */
type Found = { mime: 'image/png' | 'image/jpeg' | 'image/bmp'; data: Uint8Array } | 'unshown';

/**
 * The inline picture whose `PICFAndOfficeArtData` starts at `location` in the `Data` stream; undefined when the
 * location holds no picture (a `PICF` with `mm` 0, such as the field data of a link). A picture that cannot be read or
 * shown (no `Data` stream, a location past its end, a record that does not parse, EMF, WMF, TIFF) is an image without
 * `src`, of the size the `PICF` gives or 0 by 0 when that cannot be read.
 */
export function readPicture(data: Uint8Array | undefined, location: number): ImageInline | undefined {
  const placeholder: ImageInline = { kind: 'image', widthPx: 0, heightPx: 0 };
  if (!data || location + PICF_HEADER_SIZE > data.length) return placeholder;
  const reader = new DocReader(data);
  const lcb = reader.u32(location);
  const cbHeader = reader.u16(location + 4);
  const mm = reader.u16(location + PICF_MM);
  if (mm === 0) return undefined;
  const image: ImageInline = {
    kind: 'image',
    widthPx: round(twipsToPx((reader.u16(location + PICF_DXA_GOAL) * reader.u16(location + PICF_MX)) / 1000)),
    heightPx: round(twipsToPx((reader.u16(location + PICF_DYA_GOAL) * reader.u16(location + PICF_MY)) / 1000)),
  };
  if ((mm !== MM_SHAPE && mm !== MM_SHAPEFILE) || cbHeader < PICF_HEADER_SIZE) return image;

  let start = location + cbHeader;
  if (mm === MM_SHAPEFILE) {
    if (start >= data.length) return image;
    start += 1 + reader.u8(start);
  }
  // `lcb` counts the whole structure; a value that is too small or runs past the stream gives way to the stream's end.
  const end = lcb >= cbHeader && location + lcb <= data.length ? location + lcb : data.length;
  const found = findBlip(reader, start, end);
  if (found && found !== 'unshown') image.src = found;
  return image;
}

/** Walks the records in `[start, end)`, stepping into containers, and returns the first BLIP; undefined when a record does not parse. */
function findBlip(reader: DocReader, start: number, end: number): Found | undefined {
  let at = start;
  while (at + RECORD_HEADER_SIZE <= end) {
    const versionAndInstance = reader.u16(at);
    const version = versionAndInstance & 0xf;
    const instance = versionAndInstance >> 4;
    const type = reader.u16(at + 2);
    const length = reader.u32(at + 4);
    const body = at + RECORD_HEADER_SIZE;
    if (body + length > end) return undefined;
    if (version === CONTAINER_VERSION) {
      const inner = findBlip(reader, body, body + length);
      if (inner) return inner;
    } else if (type === FBSE) {
      if (length < FBSE_FIXED_SIZE) return undefined;
      const blip = body + FBSE_FIXED_SIZE + reader.u8(body + FBSE_NAME_LENGTH);
      const inner = blip < body + length ? findBlip(reader, blip, body + length) : undefined;
      if (inner) return inner;
    } else if (type === PNG || type === DIB || JPEG.has(type)) {
      return bitmapOf(reader, type, instance, body, length);
    } else if (OTHER_BLIPS.has(type)) {
      return 'unshown';
    }
    at = body + length;
  }
  return undefined;
}

/** A bitmap BLIP: one or two UIDs and a tag byte, then the image. Instance values with the low bit set carry two UIDs. */
function bitmapOf(reader: DocReader, type: number, instance: number, body: number, length: number): Found | undefined {
  const skip = (instance & 1 ? 2 : 1) * UID_SIZE + 1;
  if (length <= skip) return undefined;
  const bytes = reader.bytes(body + skip, length - skip);
  if (type === DIB) {
    const bmp = dibToBmp(bytes);
    return bmp ? { mime: 'image/bmp', data: bmp } : 'unshown';
  }
  return { mime: type === PNG ? 'image/png' : 'image/jpeg', data: bytes };
}

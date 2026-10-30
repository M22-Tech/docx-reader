import { describe, expect, it } from 'vitest';
import { openDocContainer } from './doc-container';
import { readPicture } from './doc-pictures';
import { blipRecord, fixture, officeArtRecord, pictureData } from './doc-test-helpers';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

describe('features.doc pictures', () => {
  const { data } = openDocContainer(fixture('features.doc'));

  it('reads the PNG at location 172 as 240 by 120 px', () => {
    const image = readPicture(data, 172);
    expect(image).toMatchObject({ kind: 'image', widthPx: 240, heightPx: 120, src: { mime: 'image/png' } });
    expect([...(image?.src?.data.subarray(0, 4) ?? [])]).toEqual(PNG_SIGNATURE);
  });

  it('reads the JPEG at location 10388 as 320 by 200 px', () => {
    const image = readPicture(data, 10388);
    expect(image).toMatchObject({ kind: 'image', widthPx: 320, heightPx: 200, src: { mime: 'image/jpeg' } });
    expect([...(image?.src?.data.subarray(0, 3) ?? [])]).toEqual(JPEG_SIGNATURE);
  });

  it('gives no picture at location 0, the field data of the hyperlink', () => {
    expect(readPicture(data, 0)).toBeUndefined();
  });
});

describe('built pictures', () => {
  const stream = (...parts: Uint8Array[]) => Uint8Array.from(parts.flatMap((part) => [...part]));

  it('uses PNG and JPEG data as it is, after one UID and the tag byte', () => {
    const png = readPicture(pictureData({ blip: blipRecord(0xf01e, 0x6e0, 1, [1, 2, 3]) }), 0);
    expect(png?.src).toEqual({ mime: 'image/png', data: Uint8Array.from([1, 2, 3]) });
    const jpeg = readPicture(pictureData({ blip: blipRecord(0xf01d, 0x46a, 1, [4, 5]) }), 0);
    expect(jpeg?.src).toEqual({ mime: 'image/jpeg', data: Uint8Array.from([4, 5]) });
    const cmyk = readPicture(pictureData({ blip: blipRecord(0xf02a, 0x6e2, 1, [6]) }), 0);
    expect(cmyk?.src?.mime).toBe('image/jpeg');
  });

  it('skips two UIDs for the instance values that have two', () => {
    const two = readPicture(pictureData({ blip: blipRecord(0xf01e, 0x6e1, 2, [7, 8, 9]) }), 0);
    expect(two?.src?.data).toEqual(Uint8Array.from([7, 8, 9]));
    const jpeg = readPicture(pictureData({ blip: blipRecord(0xf01d, 0x46b, 2, [1, 2]) }), 0);
    expect(jpeg?.src?.data).toEqual(Uint8Array.from([1, 2]));
  });

  it('gives a DIB a BMP file header with the right size and pixel offset', () => {
    const dib = new Uint8Array(40 + 8);
    new DataView(dib.buffer).setUint32(0, 40, true);
    new DataView(dib.buffer).setUint16(14, 24, true);
    const image = readPicture(pictureData({ blip: blipRecord(0xf01f, 0x7a8, 1, dib) }), 0);
    const bmp = image?.src?.data;
    expect(image?.src?.mime).toBe('image/bmp');
    expect(String.fromCharCode(bmp?.[0] ?? 0, bmp?.[1] ?? 0)).toBe('BM');
    const view = new DataView(bmp!.buffer, bmp!.byteOffset, bmp!.byteLength);
    expect(bmp).toHaveLength(14 + dib.length);
    expect(view.getUint32(2, true)).toBe(14 + dib.length);
    expect(view.getUint32(10, true)).toBe(14 + 40);
  });

  it('gives a placeholder with its size for EMF, WMF and TIFF', () => {
    for (const [type, instance] of [
      [0xf01a, 0x3d4],
      [0xf01b, 0x216],
      [0xf029, 0x6e4],
    ] as const) {
      const image = readPicture(
        pictureData({ blip: blipRecord(type, instance, 1, [1, 2, 3]), dxaGoal: 1440, dyaGoal: 720 }),
        0,
      );
      expect(image).toEqual({ kind: 'image', widthPx: 96, heightPx: 48 });
    }
  });

  it('scales the size by mx and my', () => {
    const image = readPicture(
      pictureData({ blip: blipRecord(0xf01e, 0x6e0, 1, [1]), dxaGoal: 3000, dyaGoal: 1500, mx: 500, my: 2000 }),
      0,
    );
    expect(image).toMatchObject({ widthPx: 100, heightPx: 200 });
  });

  it('reads from the given location and past the picture name when mm is 0x66', () => {
    const filler = new Uint8Array(37);
    const picture = pictureData({ blip: blipRecord(0xf01e, 0x6e0, 1, [9, 9]), mm: 0x66, name: 'logo.png' });
    const image = readPicture(stream(filler, picture), 37);
    expect(image?.src?.data).toEqual(Uint8Array.from([9, 9]));
  });

  it('finds the BLIP when other records come first and a record is skipped, not entered', () => {
    const skipped = officeArtRecord(0, 1, 0xf122, [1, 2, 3, 4]);
    const base = pictureData({ blip: blipRecord(0xf01e, 0x6e0, 1, [5]) });
    const withSkipped = stream(base.subarray(0, 68), skipped, base.subarray(68));
    new DataView(withSkipped.buffer).setUint32(0, withSkipped.length, true);
    expect(readPicture(withSkipped, 0)?.src?.data).toEqual(Uint8Array.from([5]));
  });

  it('gives a placeholder for a truncated record, and for lcb past the data', () => {
    const whole = pictureData({ blip: blipRecord(0xf01e, 0x6e0, 1, [1, 2, 3, 4, 5, 6]) });
    const cut = whole.subarray(0, whole.length - 3);
    expect(readPicture(cut, 0)).toEqual({ kind: 'image', widthPx: 240, heightPx: 120 });
    const lcbTooSmall = pictureData({ blip: blipRecord(0xf01e, 0x6e0, 1, [1, 2, 3]), lcb: 70 });
    expect(readPicture(lcbTooSmall, 0)).toEqual({ kind: 'image', widthPx: 240, heightPx: 120 });
  });

  it('gives a placeholder for a BLIP with no image bytes and for a DIB that is too short', () => {
    expect(readPicture(pictureData({ blip: blipRecord(0xf01e, 0x6e0, 1, []) }), 0)?.src).toBeUndefined();
    expect(readPicture(pictureData({ blip: blipRecord(0xf01f, 0x7a8, 1, [1, 2, 3]) }), 0)?.src).toBeUndefined();
  });

  it('gives a placeholder with the size of the PICF when no shape follows or mm is another value', () => {
    expect(readPicture(pictureData({}), 0)).toEqual({ kind: 'image', widthPx: 240, heightPx: 120 });
    expect(readPicture(pictureData({ mm: 8, blip: blipRecord(0xf01e, 0x6e0, 1, [1]) }), 0)?.src).toBeUndefined();
  });

  it('gives an unsized placeholder without a Data stream, and for a location past its end', () => {
    const placeholder = { kind: 'image', widthPx: 0, heightPx: 0 };
    expect(readPicture(undefined, 172)).toEqual(placeholder);
    const data = pictureData({ blip: blipRecord(0xf01e, 0x6e0, 1, [1]) });
    expect(readPicture(data, data.length)).toEqual(placeholder);
    expect(readPicture(data, data.length - 10)).toEqual(placeholder);
    expect(readPicture(data, 0xffffffff)).toEqual(placeholder);
  });

  it('gives no picture when the PICF has mm 0', () => {
    expect(readPicture(pictureData({ mm: 0 }), 0)).toBeUndefined();
  });
});

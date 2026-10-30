import { describe, expect, it } from 'vitest';
import { decodeHex, dibToBmp, newPictureDraft, pictureKind, pictureToImage, type PictureDraft } from './rtf-pictures';

const ascii = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0));
const draft = (parts: Partial<PictureDraft>): PictureDraft => ({ ...newPictureDraft(), ...parts });

describe('decodeHex', () => {
  it('decodes digits of either case and ignores white space between and inside chunks', () => {
    expect([...decodeHex([ascii('89 50\r\n4e'), ascii('47Ab\n')])]).toEqual([0x89, 0x50, 0x4e, 0x47, 0xab]);
  });

  it('drops an odd last digit', () => {
    expect([...decodeHex([ascii('abc')])]).toEqual([0xab]);
  });
});

describe('pictureKind', () => {
  it('names the formats', () => {
    expect(pictureKind('pngblip')).toBe('png');
    expect(pictureKind('jpegblip')).toBe('jpeg');
    expect(pictureKind('dibitmap')).toBe('dib');
    expect(pictureKind('emfblip')).toBe('metafile');
    expect(pictureKind('wmetafile')).toBe('metafile');
    expect(pictureKind('picw')).toBeUndefined();
  });
});

describe('pictureToImage', () => {
  it('sizes from the goals in twips and keeps the PNG bytes', () => {
    const image = pictureToImage(
      draft({ kind: 'png', widthGoal: 3600, heightGoal: 1800, chunks: [{ hex: true, data: ascii('89504e47') }] }),
    );
    expect(image).toMatchObject({ widthPx: 240, heightPx: 120, src: { mime: 'image/png' } });
    expect([...(image.src?.data ?? [])]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it('applies the scale in percent', () => {
    const image = pictureToImage(
      draft({
        kind: 'jpeg',
        widthGoal: 3000,
        heightGoal: 1500,
        scaleX: 50,
        scaleY: 200,
        chunks: [{ hex: true, data: ascii('ffd8ff') }],
      }),
    );
    expect(image).toMatchObject({ widthPx: 100, heightPx: 200, src: { mime: 'image/jpeg' } });
  });

  it('falls back to \\picw and \\pich in pixels for a bitmap', () => {
    const image = pictureToImage(
      draft({ kind: 'png', width: 64, height: 32, chunks: [{ hex: true, data: ascii('89') }] }),
    );
    expect(image).toMatchObject({ widthPx: 64, heightPx: 32 });
  });

  it('reads \\bin data as it is', () => {
    const image = pictureToImage(draft({ kind: 'png', chunks: [{ hex: false, data: Uint8Array.of(0x89, 0x50) }] }));
    expect([...(image.src?.data ?? [])]).toEqual([0x89, 0x50]);
  });

  it('gives a metafile a placeholder sized from 0.01 mm units', () => {
    const image = pictureToImage(
      draft({ kind: 'metafile', width: 2540, height: 1270, chunks: [{ hex: true, data: ascii('0100') }] }),
    );
    expect(image.src).toBeUndefined();
    expect(image.widthPx).toBeCloseTo(96, 3);
    expect(image.heightPx).toBeCloseTo(48, 3);
  });

  it('gives a picture without data no src', () => {
    expect(pictureToImage(draft({ kind: 'png', widthGoal: 1500, heightGoal: 1500 })).src).toBeUndefined();
  });
});

describe('dibToBmp', () => {
  function dib(bitCount: number, colors: number, pixels: number): Uint8Array {
    const out = new Uint8Array(40 + colors * 4 + pixels);
    const view = new DataView(out.buffer);
    view.setUint32(0, 40, true);
    view.setInt32(4, 2, true);
    view.setInt32(8, 2, true);
    view.setUint16(12, 1, true);
    view.setUint16(14, bitCount, true);
    return out;
  }

  it('prepends a file header whose pixel offset skips the colour table', () => {
    const bmp = dibToBmp(dib(8, 256, 4)) as Uint8Array;
    const view = new DataView(bmp.buffer);
    expect(String.fromCharCode(bmp[0] as number, bmp[1] as number)).toBe('BM');
    expect(view.getUint32(2, true)).toBe(bmp.length);
    expect(view.getUint32(10, true)).toBe(14 + 40 + 256 * 4);
    expect(bmp.length).toBe(14 + 40 + 256 * 4 + 4);
  });

  it('has the pixels right after the header for 24 bits', () => {
    const bmp = dibToBmp(dib(24, 0, 12)) as Uint8Array;
    expect(new DataView(bmp.buffer).getUint32(10, true)).toBe(54);
  });

  it('rejects data too short to hold a header', () => {
    expect(dibToBmp(new Uint8Array(10))).toBeUndefined();
    expect(
      pictureToImage(
        draft({ kind: 'dib', widthGoal: 150, heightGoal: 150, chunks: [{ hex: false, data: new Uint8Array(10) }] }),
      ).src,
    ).toBeUndefined();
  });

  it('produces a BMP image for a \\dibitmap picture', () => {
    const image = pictureToImage(draft({ kind: 'dib', chunks: [{ hex: false, data: dib(24, 0, 12) }] }));
    expect(image.src?.mime).toBe('image/bmp');
  });
});

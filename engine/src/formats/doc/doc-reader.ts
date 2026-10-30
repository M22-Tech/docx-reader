import { DocumentError } from '../../document-error';

const CHUNK = 8192;

/** A bounds-checked little-endian reader over a stream; a read past either end throws `corrupt`. */
export class DocReader {
  private readonly view: DataView;

  constructor(readonly data: Uint8Array) {
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  get length(): number {
    return this.data.length;
  }

  private check(at: number, size: number): void {
    if (!Number.isInteger(at) || !Number.isInteger(size) || at < 0 || size < 0 || at + size > this.data.length) {
      throw new DocumentError(
        'corrupt',
        `A read of ${size} bytes at ${at} is outside the ${this.data.length}-byte stream.`,
      );
    }
  }

  u8(at: number): number {
    this.check(at, 1);
    return this.view.getUint8(at);
  }

  u16(at: number): number {
    this.check(at, 2);
    return this.view.getUint16(at, true);
  }

  i16(at: number): number {
    this.check(at, 2);
    return this.view.getInt16(at, true);
  }

  u32(at: number): number {
    this.check(at, 4);
    return this.view.getUint32(at, true);
  }

  i32(at: number): number {
    this.check(at, 4);
    return this.view.getInt32(at, true);
  }

  /** A view of `length` bytes (not a copy). */
  bytes(at: number, length: number): Uint8Array {
    this.check(at, length);
    return this.data.subarray(at, at + length);
  }

  /** `count` UTF-16LE code units starting at byte `at`, one string character per unit. */
  utf16(at: number, count: number): string {
    this.check(at, count * 2);
    const parts: string[] = [];
    for (let i = 0; i < count; i += CHUNK) {
      const units = new Array<number>(Math.min(CHUNK, count - i));
      for (let j = 0; j < units.length; j++) units[j] = this.view.getUint16(at + (i + j) * 2, true);
      parts.push(String.fromCharCode(...units));
    }
    return parts.join('');
  }
}

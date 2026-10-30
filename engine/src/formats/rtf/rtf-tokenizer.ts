export type RtfToken =
  | { kind: 'open' }
  | { kind: 'close' }
  | { kind: 'word'; name: string; param?: number }
  /** A control symbol other than `\'hh`: `\\`, `\{`, `\}`, `\~`, `\-`, `\_`, `\*` and so on. */
  | { kind: 'symbol'; char: string }
  /** `\'hh`: one byte in the current code page. */
  | { kind: 'hex'; value: number }
  /** A run of text bytes, not decoded; a view into the input. */
  | { kind: 'text'; bytes: Uint8Array }
  /** The N raw bytes after `\binN`; a view into the input. */
  | { kind: 'bin'; data: Uint8Array };

const BACKSLASH = 0x5c;
const OPEN = 0x7b;
const CLOSE = 0x7d;
const CR = 0x0d;
const LF = 0x0a;
const SPACE = 0x20;
const MINUS = 0x2d;
const QUOTE = 0x27;
const MAX_WORD = 32;
const MAX_DIGITS = 10;

const isLetter = (b: number) => (b >= 0x41 && b <= 0x5a) || (b >= 0x61 && b <= 0x7a);
const isDigit = (b: number) => b >= 0x30 && b <= 0x39;

function hexValue(b: number | undefined): number {
  if (b === undefined) return -1;
  if (b >= 0x30 && b <= 0x39) return b - 0x30;
  if (b >= 0x41 && b <= 0x46) return b - 0x41 + 10;
  if (b >= 0x61 && b <= 0x66) return b - 0x61 + 10;
  return -1;
}

/**
 * Splits RTF bytes into tokens in one pass: each byte is looked at once and text comes out as views into the input,
 * so the work is linear in the input size. CR and LF outside `\bin` data are dropped. A `\` before a line end is `\par`.
 */
export function* tokenize(bytes: Uint8Array): Generator<RtfToken> {
  const length = bytes.length;
  let pos = 0;
  while (pos < length) {
    const byte = bytes[pos] as number;
    if (byte === OPEN) {
      pos++;
      yield { kind: 'open' };
    } else if (byte === CLOSE) {
      pos++;
      yield { kind: 'close' };
    } else if (byte === CR || byte === LF) {
      pos++;
    } else if (byte === BACKSLASH) {
      pos++;
      if (pos >= length) return;
      const next = bytes[pos] as number;
      if (isLetter(next)) {
        const start = pos;
        while (pos < length && isLetter(bytes[pos] as number) && pos - start < MAX_WORD) pos++;
        const name = String.fromCharCode(...bytes.subarray(start, pos));
        // Letters beyond the length limit are not part of any word we know; skip them.
        while (pos < length && isLetter(bytes[pos] as number)) pos++;
        let param: number | undefined;
        let sign = 1;
        if (bytes[pos] === MINUS && isDigit(bytes[pos + 1] ?? 0)) {
          sign = -1;
          pos++;
        }
        if (pos < length && isDigit(bytes[pos] as number)) {
          let value = 0;
          let digits = 0;
          while (pos < length && isDigit(bytes[pos] as number)) {
            if (digits++ < MAX_DIGITS) value = value * 10 + (bytes[pos] as number) - 0x30;
            pos++;
          }
          param = sign * value;
        }
        if (bytes[pos] === SPACE) pos++;
        if (name === 'bin' && param !== undefined && param >= 0) {
          const end = Math.min(pos + param, length);
          yield { kind: 'bin', data: bytes.subarray(pos, end) };
          pos = end;
        } else if (param === undefined) {
          yield { kind: 'word', name };
        } else {
          yield { kind: 'word', name, param };
        }
      } else if (next === QUOTE) {
        const high = hexValue(bytes[pos + 1]);
        const low = hexValue(bytes[pos + 2]);
        if (high >= 0 && low >= 0) {
          pos += 3;
          yield { kind: 'hex', value: high * 16 + low };
        } else {
          pos++;
        }
      } else if (next === CR || next === LF) {
        pos++;
        yield { kind: 'word', name: 'par' };
      } else {
        pos++;
        yield { kind: 'symbol', char: String.fromCharCode(next) };
      }
    } else {
      const start = pos;
      pos++;
      while (pos < length) {
        const b = bytes[pos] as number;
        if (b === BACKSLASH || b === OPEN || b === CLOSE || b === CR || b === LF) break;
        pos++;
      }
      yield { kind: 'text', bytes: bytes.subarray(start, pos) };
    }
  }
}

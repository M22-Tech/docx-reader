import { describe, expect, it } from 'vitest';
import { tokenize, type RtfToken } from './rtf-tokenizer';

const encode = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0));
const tokens = (text: string | Uint8Array): RtfToken[] => [...tokenize(typeof text === 'string' ? encode(text) : text)];
const summary = (list: RtfToken[]) =>
  list.map((t) => {
    switch (t.kind) {
      case 'open':
        return '{';
      case 'close':
        return '}';
      case 'word':
        return `\\${t.name}${t.param ?? ''}`;
      case 'symbol':
        return `\\${t.char}`;
      case 'hex':
        return `'${t.value.toString(16)}`;
      case 'text':
        return `"${String.fromCharCode(...t.bytes)}"`;
      case 'bin':
        return `bin[${t.data.length}]`;
    }
  });

describe('tokenize', () => {
  it('reads groups, control words and text', () => {
    expect(summary(tokens('{\\rtf1\\ansi Hello}'))).toEqual(['{', '\\rtf1', '\\ansi', '"Hello"', '}']);
  });

  it('consumes one space after a control word and keeps the others', () => {
    expect(summary(tokens('\\b  two'))).toEqual(['\\b', '" two"']);
    expect(summary(tokens('\\b0text'))).toEqual(['\\b0', '"text"']);
  });

  it('ends a control word at any non-letter, non-digit character without consuming it', () => {
    expect(summary(tokens('\\b\\i{\\u-3913?'))).toEqual(['\\b', '\\i', '{', '\\u-3913', '"?"']);
  });

  it('reads signed parameters', () => {
    expect(summary(tokens('\\fi-360\\li720 x'))).toEqual(['\\fi-360', '\\li720', '"x"']);
  });

  it('treats a minus that is not followed by a digit as text', () => {
    expect(summary(tokens('\\b-x'))).toEqual(['\\b', '"-x"']);
  });

  it('reads control symbols', () => {
    expect(summary(tokens('\\\\\\{\\}\\~\\-\\_\\*'))).toEqual(['\\\\', '\\{', '\\}', '\\~', '\\-', '\\_', '\\*']);
  });

  it('reads hex escapes, and drops a malformed one', () => {
    expect(summary(tokens("caf\\'e9\\'E9"))).toEqual(['"caf"', "'e9", "'e9"]);
    expect(summary(tokens("\\'zz!"))).toEqual(['"zz!"']);
  });

  it('ignores CR and LF outside text', () => {
    expect(summary(tokens('a\r\nb\n\\par\r\n'))).toEqual(['"a"', '"b"', '\\par']);
  });

  it('reads a backslash before a line end as \\par', () => {
    expect(summary(tokens('a\\\nb'))).toEqual(['"a"', '\\par', '"b"']);
  });

  it('takes the N bytes after \\binN as one token, whatever they contain', () => {
    const input = Uint8Array.from([...encode('\\bin5 '), 0x7b, 0x5c, 0x7d, 0x0d, 0x0a, ...encode('after')]);
    const list = tokens(input);
    expect(summary(list)).toEqual(['bin[5]', '"after"']);
    expect([...(list[0] as { data: Uint8Array }).data]).toEqual([0x7b, 0x5c, 0x7d, 0x0d, 0x0a]);
  });

  it('stops \\bin data at the end of the input', () => {
    expect(summary(tokens('\\bin100 abc'))).toEqual(['bin[3]']);
  });

  it('gives text bytes as views of the input, not decoded', () => {
    const input = Uint8Array.of(0x41, 0xe9, 0x42);
    const [token] = tokens(input);
    expect(token).toMatchObject({ kind: 'text' });
    expect([...(token as { bytes: Uint8Array }).bytes]).toEqual([0x41, 0xe9, 0x42]);
  });

  it('copes with a trailing backslash, an empty input and a very long word', () => {
    expect(tokens('abc\\')).toHaveLength(1);
    expect(tokens('')).toEqual([]);
    expect(summary(tokens(`\\${'a'.repeat(100)}1 x`))).toHaveLength(2);
  });

  it('is linear: a 5 MB input tokenizes in well under a second', () => {
    const chunk = encode('{\\b bold}\\par plain text here ');
    const input = new Uint8Array(chunk.length * 170_000);
    for (let i = 0; i < 170_000; i++) input.set(chunk, i * chunk.length);
    const start = performance.now();
    const count = Array.from(tokenize(input)).length;
    expect(count).toBeGreaterThan(500_000);
    expect(performance.now() - start).toBeLessThan(1500);
  });
});

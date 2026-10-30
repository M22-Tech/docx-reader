/** The Windows code page for an RTF `\fcharsetN`; 0 (ANSI) means the document's own code page. */
const CODE_PAGE_OF_CHARSET: Record<number, number> = {
  2: 42,
  128: 932,
  129: 949,
  134: 936,
  136: 950,
  161: 1253,
  162: 1254,
  177: 1255,
  178: 1256,
  186: 1257,
  204: 1251,
  222: 874,
  238: 1250,
};

/** The pseudo code page of the Symbol and Wingdings fonts. */
export const SYMBOL_CODE_PAGE = 42;
export const DEFAULT_CODE_PAGE = 1252;

const LABEL_OF_CODE_PAGE: Record<number, string> = {
  874: 'windows-874',
  932: 'shift_jis',
  936: 'gbk',
  949: 'euc-kr',
  950: 'big5',
  1250: 'windows-1250',
  1251: 'windows-1251',
  1252: 'windows-1252',
  1253: 'windows-1253',
  1254: 'windows-1254',
  1255: 'windows-1255',
  1256: 'windows-1256',
  1257: 'windows-1257',
  1258: 'windows-1258',
  10000: 'macintosh',
  65001: 'utf-8',
};

/** The code page a font's charset selects, or undefined to keep the document's. */
export function codePageOfCharset(charset: number | undefined): number | undefined {
  return charset === undefined ? undefined : CODE_PAGE_OF_CHARSET[charset];
}

const decoders = new Map<string, TextDecoder>();

function decoderFor(codePage: number): TextDecoder {
  const label = LABEL_OF_CODE_PAGE[codePage] ?? 'windows-1252';
  let decoder = decoders.get(label);
  if (!decoder) {
    try {
      decoder = new TextDecoder(label);
    } catch {
      decoder = new TextDecoder('windows-1252');
    }
    decoders.set(label, decoder);
  }
  return decoder;
}

/**
 * Decodes bytes in a code page. Symbol-font bytes become private-use characters (U+F000 plus the byte), which is how
 * the same characters arrive from `\u`. Code pages `TextDecoder` doesn't know (437, 850) are read as 1252.
 */
export function decodeBytes(bytes: Uint8Array, codePage: number): string {
  if (codePage === SYMBOL_CODE_PAGE) {
    const chars: string[] = [];
    for (const byte of bytes) chars.push(String.fromCharCode(byte > 0x20 ? 0xf000 + byte : byte));
    return chars.join('');
  }
  return decoderFor(codePage).decode(bytes);
}

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as CFB from 'cfb';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { DocumentError, type DocumentErrorCode } from '../document-error';
import type { Format } from '../formats/format-adapter';
import { detect } from './detect';

const fixturesDir = resolve(import.meta.dirname, '../../../fixtures');

function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(resolve(fixturesDir, name)));
}

async function zipOf(files: Record<string, string>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  return zip.generateAsync({ type: 'uint8array' });
}

function compoundFileOf(streams: string[]): Uint8Array {
  const container = CFB.utils.cfb_new();
  for (const name of streams) CFB.utils.cfb_add(container, `/${name}`, new Uint8Array([1, 2, 3, 4]));
  return new Uint8Array(CFB.write(container, { type: 'array' }) as ArrayBuffer);
}

function textBytes(text: string, bom: number[] = []): Uint8Array {
  return new Uint8Array([...bom, ...new TextEncoder().encode(text)]);
}

function utf16Bytes(text: string, bigEndian: boolean): Uint8Array {
  const out = [bigEndian ? 0xfe : 0xff, bigEndian ? 0xff : 0xfe];
  for (const char of text) {
    const code = char.charCodeAt(0);
    out.push(...(bigEndian ? [code >> 8, code & 0xff] : [code & 0xff, code >> 8]));
  }
  return new Uint8Array(out);
}

async function errorCodeOf(bytes: Uint8Array): Promise<DocumentErrorCode | undefined> {
  try {
    await detect(bytes);
  } catch (error) {
    if (error instanceof DocumentError) return error.code;
    throw error;
  }
  return undefined;
}

const contentTypes = (partName: string, contentType: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="${partName}" ContentType="${contentType}"/></Types>`;

const DOCX_MAIN = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';

describe('detect: fixtures', () => {
  it.each<[string, Format]>([
    ['features.docx', 'docx'],
    ['minimal.docx', 'docx'],
    ['features.doc', 'doc'],
    ['minimal.doc', 'doc'],
    ['features.rtf', 'rtf'],
    ['minimal.rtf', 'rtf'],
    ['features.odt', 'odt'],
    ['minimal.odt', 'odt'],
    ['rtf-named.doc', 'rtf'],
    ['html-named.doc', 'html'],
  ])('%s is %s', async (name, format) => {
    expect(await detect(fixture(name))).toBe(format);
  });

  it.each<[string, DocumentErrorCode]>([
    ['not-a-document.docx', 'unsupported_format'],
    ['truncated.docx', 'corrupt'],
    ['empty.docx', 'empty'],
  ])('%s is %s', async (name, code) => {
    expect(await errorCodeOf(fixture(name))).toBe(code);
  });
});

describe('detect: zip archives', () => {
  it('rejects a zip with no document parts', async () => {
    expect(await errorCodeOf(await zipOf({ 'readme.txt': 'hello' }))).toBe('unsupported_format');
  });

  it('rejects an OOXML package that is not word processing', async () => {
    const bytes = await zipOf({
      '[Content_Types].xml': contentTypes(
        '/xl/workbook.xml',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
      ),
      'xl/workbook.xml': '<workbook/>',
    });
    expect(await errorCodeOf(bytes)).toBe('unsupported_format');
  });

  it('reports corrupt when the content types name docx but word/document.xml is missing', async () => {
    const bytes = await zipOf({ '[Content_Types].xml': contentTypes('/word/document.xml', DOCX_MAIN) });
    expect(await errorCodeOf(bytes)).toBe('corrupt');
  });

  it('finds the main part through the content types', async () => {
    const bytes = await zipOf({
      '[Content_Types].xml': contentTypes('/word/main.xml', DOCX_MAIN),
      'word/main.xml': '<document/>',
    });
    expect(await detect(bytes)).toBe('docx');
  });

  it('accepts the dotx, docm and dotm main parts', async () => {
    for (const type of [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml',
      'application/vnd.ms-word.document.macroEnabled.main+xml',
      'application/vnd.ms-word.template.macroEnabledTemplate.main+xml',
    ]) {
      const bytes = await zipOf({
        '[Content_Types].xml': contentTypes('/word/document.xml', type),
        'word/document.xml': '<document/>',
      });
      expect(await detect(bytes)).toBe('docx');
    }
  });

  it('detects odt and ott by their mimetype entry', async () => {
    expect(await detect(await zipOf({ mimetype: 'application/vnd.oasis.opendocument.text' }))).toBe('odt');
    expect(await detect(await zipOf({ mimetype: 'application/vnd.oasis.opendocument.text-template' }))).toBe('odt');
  });

  it('rejects other OpenDocument types', async () => {
    expect(await errorCodeOf(await zipOf({ mimetype: 'application/vnd.oasis.opendocument.spreadsheet' }))).toBe(
      'unsupported_format',
    );
  });

  it('reports corrupt for content types that are not XML', async () => {
    expect(await errorCodeOf(await zipOf({ '[Content_Types].xml': '<Types><Override' }))).toBe('corrupt');
  });
});

describe('detect: compound files', () => {
  it('reports encrypted for an EncryptedPackage stream', async () => {
    expect(await errorCodeOf(compoundFileOf(['EncryptedPackage', 'EncryptionInfo']))).toBe('encrypted');
  });

  it('detects doc by its WordDocument stream', async () => {
    expect(await detect(compoundFileOf(['WordDocument', '1Table']))).toBe('doc');
  });

  it('rejects a compound file with neither stream', async () => {
    expect(await errorCodeOf(compoundFileOf(['Workbook']))).toBe('unsupported_format');
  });

  it('reports corrupt for a damaged compound file', async () => {
    const bytes = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
    expect(await errorCodeOf(bytes)).toBe('corrupt');
  });
});

describe('detect: text formats', () => {
  const rtf = String.raw`{\rtf1\ansi Hello}`;
  const html = '<!DOCTYPE HTML><html><body>Hi</body></html>';
  const utf8Bom = [0xef, 0xbb, 0xbf];

  it('detects rtf after a UTF-8 byte-order mark and after whitespace', async () => {
    expect(await detect(textBytes(rtf, utf8Bom))).toBe('rtf');
    expect(await detect(textBytes(`\r\n \t${rtf}`))).toBe('rtf');
    expect(await detect(textBytes(`  ${rtf}`, utf8Bom))).toBe('rtf');
  });

  it('detects html after a UTF-8 byte-order mark and after whitespace', async () => {
    expect(await detect(textBytes(html, utf8Bom))).toBe('html');
    expect(await detect(textBytes(`\n\n  ${html}`))).toBe('html');
    expect(await detect(textBytes('<HTML>', utf8Bom))).toBe('html');
  });

  it('detects html behind an XML declaration', async () => {
    expect(await detect(textBytes('<?xml version="1.0"?>\n<html xmlns="http://www.w3.org/1999/xhtml">'))).toBe('html');
  });

  it('detects text with a UTF-16 byte-order mark', async () => {
    expect(await detect(utf16Bytes(rtf, false))).toBe('rtf');
    expect(await detect(utf16Bytes(rtf, true))).toBe('rtf');
    expect(await detect(utf16Bytes(html, false))).toBe('html');
    expect(await detect(utf16Bytes(html, true))).toBe('html');
  });

  it('rejects plain text, other markup and tiny inputs', async () => {
    expect(await errorCodeOf(textBytes('Just some words'))).toBe('unsupported_format');
    expect(await errorCodeOf(textBytes('<?xml version="1.0"?><note/>'))).toBe('unsupported_format');
    expect(await errorCodeOf(textBytes('<div>not a page</div>'))).toBe('unsupported_format');
    expect(await errorCodeOf(new Uint8Array([0x50]))).toBe('unsupported_format');
  });
});

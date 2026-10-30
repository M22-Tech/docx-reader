import * as CFB from 'cfb';
import JSZip from 'jszip';
import { DocumentError } from '../document-error';
import type { Format } from '../formats/format-adapter';
import { timed } from '../logger';

const CONTENT_TYPES = '[Content_Types].xml';
const DEFAULT_MAIN_PART = 'word/document.xml';
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ODT_MIME_TYPES = ['application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.text-template'];
// Main document parts of docx, docm, dotx and dotm.
const DOCX_MAIN_CONTENT_TYPE =
  /^application\/vnd\.(openxmlformats-officedocument\.wordprocessingml|ms-word)\.(document|template)(\.macroEnabled(Template)?)?\.main\+xml$/;
// Enough to see a byte-order mark, whitespace and the first tag.
const TEXT_HEAD_BYTES = 2048;

/** Works out the format from the bytes, never from the file name. */
export function detect(bytes: Uint8Array): Promise<Format> {
  return timed('detect', () => detectFormat(bytes));
}

async function detectFormat(bytes: Uint8Array): Promise<Format> {
  if (bytes.length === 0) throw new DocumentError('empty', 'The file is empty.');
  if (isZip(bytes)) return detectZip(bytes);
  if (startsWith(bytes, OLE_MAGIC)) return detectCompoundFile(bytes);
  const text = detectText(bytes);
  if (text) return text;
  throw new DocumentError('unsupported_format', 'The file is not a supported document.');
}

function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  return magic.every((value, index) => bytes[index] === value);
}

function isZip(bytes: Uint8Array): boolean {
  return (
    startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWith(bytes, [0x50, 0x4b, 0x05, 0x06]) ||
    startsWith(bytes, [0x50, 0x4b, 0x07, 0x08])
  );
}

async function detectZip(bytes: Uint8Array): Promise<Format> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch (cause) {
    throw new DocumentError('corrupt', 'The zip archive cannot be opened.', { cause });
  }

  const contentTypes = zip.file(CONTENT_TYPES);
  if (contentTypes) {
    const mainPart = findMainPart(await readText(contentTypes));
    if (mainPart !== undefined) {
      if (!zip.file(mainPart)) throw new DocumentError('corrupt', `The part ${mainPart} is missing.`);
      return 'docx';
    }
  }

  const mimetype = zip.file('mimetype');
  if (mimetype) {
    const value = (await readText(mimetype)).trim();
    if (ODT_MIME_TYPES.includes(value)) return 'odt';
  }

  throw new DocumentError('unsupported_format', 'The zip archive is not a supported document.');
}

async function readText(file: JSZip.JSZipObject): Promise<string> {
  try {
    return await file.async('string');
  } catch (cause) {
    throw new DocumentError('corrupt', `The part ${file.name} cannot be read.`, { cause });
  }
}

/** The main document part named by the content types, or undefined when they don't name a docx. */
function findMainPart(contentTypesXml: string): string | undefined {
  const xml = new DOMParser().parseFromString(contentTypesXml, 'application/xml');
  if (xml.getElementsByTagName('parsererror').length > 0) {
    throw new DocumentError('corrupt', `${CONTENT_TYPES} is not valid XML.`);
  }
  for (const override of Array.from(xml.getElementsByTagName('Override'))) {
    const contentType = override.getAttribute('ContentType') ?? '';
    const partName = override.getAttribute('PartName');
    if (partName && DOCX_MAIN_CONTENT_TYPE.test(contentType)) return partName.replace(/^\//, '');
  }
  // Some writers leave the override out and rely on the default location.
  const names = Array.from(xml.getElementsByTagName('Default')).map((d) => d.getAttribute('ContentType') ?? '');
  return names.some((n) => DOCX_MAIN_CONTENT_TYPE.test(n)) ? DEFAULT_MAIN_PART : undefined;
}

function detectCompoundFile(bytes: Uint8Array): Format {
  let names: string[];
  try {
    const container = CFB.read(bytes, { type: 'array' });
    names = container.FileIndex.map((entry) => entry.name);
  } catch (cause) {
    throw new DocumentError('corrupt', 'The compound file cannot be read.', { cause });
  }
  if (names.includes('EncryptedPackage')) throw new DocumentError('encrypted', 'The document is password-protected.');
  if (names.includes('WordDocument')) return 'doc';
  throw new DocumentError('unsupported_format', 'The compound file is not a Word document.');
}

function detectText(bytes: Uint8Array): Format | undefined {
  const text = decodeHead(bytes.subarray(0, TEXT_HEAD_BYTES)).replace(/^\s+/, '');
  if (text.startsWith('{\\rtf')) return 'rtf';
  if (/^(<\?xml[^>]*\?>\s*)?<(html|!doctype\s+html)/i.test(text)) return 'html';
  return undefined;
}

function decodeHead(head: Uint8Array): string {
  if (head[0] === 0xff && head[1] === 0xfe) return new TextDecoder('utf-16le').decode(head);
  if (head[0] === 0xfe && head[1] === 0xff) return new TextDecoder('utf-16be').decode(head);
  return new TextDecoder('utf-8').decode(head);
}

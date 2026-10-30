import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { walkBody, type Body } from './odt-body';
import { readListStyles } from './odt-lists';
import { readStyles } from './odt-styles';
import { NS } from './odt-xml';

const DECLARATIONS = Object.entries({
  office: NS.office,
  style: NS.style,
  text: NS.text,
  table: NS.table,
  draw: NS.draw,
  fo: NS.fo,
  svg: NS.svg,
  xlink: NS.xlink,
  dc: NS.dc,
})
  .map(([prefix, uri]) => `xmlns:${prefix}="${uri}"`)
  .join(' ');

export const fixture = (name: string) =>
  new Uint8Array(readFileSync(resolve(import.meta.dirname, '../../../../fixtures', name)));

/** A `content.xml` with the given automatic styles and body. */
export function contentXml(body: string, automaticStyles = ''): string {
  return `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${DECLARATIONS}><office:automatic-styles>${automaticStyles}</office:automatic-styles><office:body><office:text>${body}</office:text></office:body></office:document-content>`;
}

/** A `styles.xml` with the given named styles, other `office:` sections and master styles. */
export function stylesXml(parts: { styles?: string; automatic?: string; master?: string } = {}): string {
  return `<?xml version="1.0" encoding="UTF-8"?><office:document-styles ${DECLARATIONS}><office:styles>${parts.styles ?? ''}</office:styles><office:automatic-styles>${parts.automatic ?? ''}</office:automatic-styles><office:master-styles>${parts.master ?? ''}</office:master-styles></office:document-styles>`;
}

export function manifestXml(contentEntry = ''): string {
  return `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="${NS.manifest}"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml">${contentEntry}</manifest:file-entry></manifest:manifest>`;
}

export function metaXml(title: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><office:document-meta ${DECLARATIONS}><office:meta><dc:title>${title}</dc:title></office:meta></office:document-meta>`;
}

/** Zips the given parts into an odt file; a `null` part is left out. */
export async function buildOdt(
  parts: {
    content?: string | null;
    styles?: string | null;
    meta?: string | null;
    manifest?: string | null;
    files?: Record<string, Uint8Array>;
  } = {},
): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/vnd.oasis.opendocument.text');
  const named: [string, string | null | undefined][] = [
    ['content.xml', parts.content === undefined ? contentXml('') : parts.content],
    ['styles.xml', parts.styles],
    ['meta.xml', parts.meta],
    ['META-INF/manifest.xml', parts.manifest],
  ];
  for (const [path, text] of named) if (text) zip.file(path, text);
  for (const [path, data] of Object.entries(parts.files ?? {})) zip.file(path, data);
  return zip.generateAsync({ type: 'uint8array' });
}

/** Parses a fragment of ODF XML into its root element. */
export function element(xml: string): Element {
  const doc = new DOMParser().parseFromString(
    `<office:document-content ${DECLARATIONS}>${xml}</office:document-content>`,
    'application/xml',
  );
  return doc.documentElement;
}

/** A parsed `content.xml` and `styles.xml` pair for the style readers. */
export function documents(content: string, styles?: string): { content: Document; styles: Document | undefined } {
  const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');
  return { content: parse(content), styles: styles === undefined ? undefined : parse(styles) };
}

export const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
export const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

/** Runs the style and body stages on a body fragment, as `parseOdt` does. */
export function walk(
  body: string,
  options: { automatic?: string; styles?: string; images?: Record<string, Uint8Array>; textWidthMm?: number } = {},
): Body {
  const { content, styles } = documents(
    contentXml(body, options.automatic),
    options.styles === undefined ? undefined : stylesXml({ styles: options.styles }),
  );
  const text = content.getElementsByTagNameNS(NS.office, 'text')[0];
  if (!text) throw new Error('no office:text');
  return walkBody(text, {
    styles: readStyles(content, styles),
    listStyles: readListStyles(content, styles),
    images: new Map(Object.entries(options.images ?? {})),
    textWidthMm: options.textWidthMm ?? 160,
  });
}

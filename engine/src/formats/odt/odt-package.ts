import JSZip from 'jszip';
import { DocumentError } from '../../document-error';
import { attr, descendants, NS } from './odt-xml';

/** The opened zip: the XML parts and access to the other files (pictures). */
export interface OdtPackage {
  content: Document;
  /** Absent when the file has no `styles.xml`. */
  styles: Document | undefined;
  /** Absent when the file has no `meta.xml` or it can't be read. */
  meta: Document | undefined;
  /** The bytes of a file in the zip, or undefined when there is none with this path. */
  readFile(path: string): Promise<Uint8Array | undefined>;
}

function parseXml(xml: string, part: string): Document {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  // Browsers and jsdom report a parse error as a document holding a parsererror element.
  if (doc.getElementsByTagName('parsererror').length > 0 || !doc.documentElement) {
    throw new DocumentError('corrupt', `${part} is not well-formed XML.`);
  }
  return doc;
}

/** True when the manifest lists encryption data for `content.xml`. */
function contentIsEncrypted(manifest: Document): boolean {
  return descendants(manifest.documentElement, NS.manifest, 'file-entry').some(
    (entry) =>
      attr(entry, NS.manifest, 'full-path') === 'content.xml' &&
      entry.getElementsByTagNameNS(NS.manifest, 'encryption-data').length > 0,
  );
}

/** Opens the zip and parses `content.xml`, `styles.xml` and `meta.xml`. */
export async function readOdtPackage(bytes: Uint8Array): Promise<OdtPackage> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch (cause) {
    throw new DocumentError('corrupt', 'The file is not a readable zip archive.', { cause });
  }

  async function text(path: string): Promise<string | undefined> {
    const entry = zip.file(path);
    if (!entry) return undefined;
    try {
      return await entry.async('string');
    } catch (cause) {
      throw new DocumentError('corrupt', `${path} can't be read from the archive.`, { cause });
    }
  }

  const manifestXml = await text('META-INF/manifest.xml');
  if (manifestXml !== undefined) {
    // A manifest that can't be parsed doesn't stop the file; only its encryption entries matter here.
    let manifest: Document | undefined;
    try {
      manifest = parseXml(manifestXml, 'META-INF/manifest.xml');
    } catch {
      manifest = undefined;
    }
    if (manifest && contentIsEncrypted(manifest)) {
      throw new DocumentError('encrypted', 'The document is protected with a password.');
    }
  }

  const contentXml = await text('content.xml');
  if (contentXml === undefined) throw new DocumentError('corrupt', 'The archive has no content.xml.');
  const content = parseXml(contentXml, 'content.xml');

  const stylesXml = await text('styles.xml');
  const styles = stylesXml === undefined ? undefined : parseXml(stylesXml, 'styles.xml');

  // The title is a nicety: a broken meta.xml doesn't make the document unreadable.
  let meta: Document | undefined;
  const metaXml = await text('meta.xml');
  if (metaXml !== undefined) {
    try {
      meta = parseXml(metaXml, 'meta.xml');
    } catch {
      meta = undefined;
    }
  }

  return {
    content,
    styles,
    meta,
    async readFile(path) {
      const entry = zip.file(path);
      if (!entry) return undefined;
      try {
        return await entry.async('uint8array');
      } catch {
        return undefined;
      }
    },
  };
}

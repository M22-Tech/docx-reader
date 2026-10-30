import { DocumentError } from '../../document-error';
import { timed } from '../../logger';
import type { DocumentModel } from '../../model/document-model';
import { imagePaths, walkBody } from './odt-body';
import { readListStyles } from './odt-lists';
import { readOdtPackage, type OdtPackage } from './odt-package';
import { readPage } from './odt-page';
import { readStyles } from './odt-styles';
import { descendants, firstChild, NS } from './odt-xml';

async function readImages(pkg: OdtPackage, paths: string[], signal: AbortSignal): Promise<Map<string, Uint8Array>> {
  const images = new Map<string, Uint8Array>();
  for (const path of paths) {
    signal.throwIfAborted();
    const data = await pkg.readFile(path);
    if (data) images.set(path, data);
  }
  return images;
}

function readTitle(meta: Document | undefined): string | undefined {
  const title = meta ? descendants(meta.documentElement, NS.dc, 'title')[0]?.textContent?.trim() : undefined;
  return title || undefined;
}

/** Parses an OpenDocument text file (odt, ott) into the document model. */
export async function parseOdt(bytes: Uint8Array, signal: AbortSignal): Promise<DocumentModel> {
  signal.throwIfAborted();
  const pkg = await timed('odt package', () => readOdtPackage(bytes));
  signal.throwIfAborted();

  const root = firstChild(pkg.content.documentElement, NS.office, 'body');
  const text = root ? firstChild(root, NS.office, 'text') : undefined;
  if (!text) throw new DocumentError('corrupt', 'content.xml has no text body.');

  const { styles, listStyles, page } = await timed('odt styles', () => {
    const odtStyles = readStyles(pkg.content, pkg.styles);
    return {
      styles: odtStyles,
      listStyles: readListStyles(pkg.content, pkg.styles),
      page: readPage(pkg.content, pkg.styles, odtStyles, text),
    };
  });
  signal.throwIfAborted();

  const images = await timed('odt images', () => readImages(pkg, imagePaths(text), signal));
  signal.throwIfAborted();

  const textWidthMm = Math.max(page.widthMm - page.marginLeftMm - page.marginRightMm, 0);
  const body = await timed('odt body', () => walkBody(text, { styles, listStyles, images, textWidthMm }));
  signal.throwIfAborted();

  const model: DocumentModel = { page, blocks: body.blocks, notes: body.notes };
  const title = readTitle(pkg.meta);
  if (title) model.title = title;
  return model;
}

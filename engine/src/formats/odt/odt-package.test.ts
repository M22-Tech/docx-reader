import { describe, expect, it } from 'vitest';
import { DocumentError } from '../../document-error';
import { readOdtPackage } from './odt-package';
import { buildOdt, contentXml, manifestXml, metaXml, stylesXml } from './odt-test-helpers';

async function failure(bytes: Uint8Array): Promise<DocumentError> {
  const error: unknown = await readOdtPackage(bytes).then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(DocumentError);
  return error as DocumentError;
}

describe('readOdtPackage', () => {
  it('reads content, styles and meta, and the other files by path', async () => {
    const bytes = await buildOdt({
      content: contentXml('<text:p>Hi</text:p>'),
      styles: stylesXml(),
      meta: metaXml('A title'),
      manifest: manifestXml(),
      files: { 'Pictures/a.png': new Uint8Array([1, 2, 3]) },
    });
    const pkg = await readOdtPackage(bytes);

    expect(pkg.content.documentElement.localName).toBe('document-content');
    expect(pkg.styles?.documentElement.localName).toBe('document-styles');
    expect(pkg.meta?.documentElement.localName).toBe('document-meta');
    expect(await pkg.readFile('Pictures/a.png')).toEqual(new Uint8Array([1, 2, 3]));
    expect(await pkg.readFile('Pictures/missing.png')).toBeUndefined();
  });

  it('leaves styles and meta undefined when the file has none', async () => {
    const pkg = await readOdtPackage(await buildOdt());
    expect(pkg.styles).toBeUndefined();
    expect(pkg.meta).toBeUndefined();
  });

  it('reports encryption data on content.xml as encrypted', async () => {
    const entry = '<manifest:encryption-data manifest:checksum-type="SHA1/1K" manifest:checksum="AAAA"/>';
    const error = await failure(await buildOdt({ manifest: manifestXml(entry) }));
    expect(error.code).toBe('encrypted');
  });

  it('does not call a file encrypted because another entry is', async () => {
    const manifest = `<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"><manifest:file-entry manifest:full-path="Pictures/a.png"><manifest:encryption-data/></manifest:file-entry></manifest:manifest>`;
    const pkg = await readOdtPackage(await buildOdt({ manifest }));
    expect(pkg.content).toBeDefined();
  });

  it('reports a missing content.xml as corrupt', async () => {
    expect((await failure(await buildOdt({ content: null }))).code).toBe('corrupt');
  });

  it('reports malformed XML in content.xml or styles.xml as corrupt', async () => {
    expect(
      (await failure(await buildOdt({ content: '<office:document-content><text:p></office:document-content>' }))).code,
    ).toBe('corrupt');
    expect((await failure(await buildOdt({ styles: '<office:document-styles>' }))).code).toBe('corrupt');
  });

  it('reports bytes that are not a zip as corrupt', async () => {
    expect((await failure(new TextEncoder().encode('not a zip file at all'))).code).toBe('corrupt');
  });

  it('ignores a meta.xml or manifest that cannot be parsed', async () => {
    const pkg = await readOdtPackage(await buildOdt({ meta: '<broken', manifest: '<broken' }));
    expect(pkg.meta).toBeUndefined();
    expect(pkg.content).toBeDefined();
  });
});

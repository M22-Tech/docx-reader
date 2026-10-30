import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DocumentError } from '../../document-error';
import { sanitizeReading } from '../../sanitize/sanitize';
import { docxAdapter, pageWidthFromCss } from './docx-adapter';

const fixture = (name: string) =>
  new Uint8Array(readFileSync(resolve(import.meta.dirname, '../../../../fixtures', name)));
const ctx = () => ({ signal: new AbortController().signal });

async function reading(name: string): Promise<HTMLElement> {
  const html = sanitizeReading(await docxAdapter.renderReading(fixture(name), ctx()));
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

describe('pageWidthFromCss', () => {
  it('converts the units at 96 dpi', () => {
    expect(pageWidthFromCss('595.3pt')).toBe(794);
    expect(pageWidthFromCss('794px')).toBe(794);
    expect(pageWidthFromCss('210mm')).toBe(794);
    expect(pageWidthFromCss('21cm')).toBe(794);
    expect(pageWidthFromCss('8.5in')).toBe(816);
    expect(pageWidthFromCss(' 612PT ')).toBe(816);
  });

  it('falls back to A4 when missing or unreadable', () => {
    for (const value of [undefined, null, '', 'auto', '100%', '12em', '0pt', '-5pt', 'pt', '12']) {
      expect(pageWidthFromCss(value)).toBe(794);
    }
  });
});

describe('docxAdapter', () => {
  it('has both modes', () => {
    expect(docxAdapter.format).toBe('docx');
    expect(docxAdapter.modes).toEqual(['layout', 'reading']);
  });

  it('reads minimal.docx in Reading', async () => {
    const root = await reading('minimal.docx');
    expect(root.querySelector('.dr-reading')?.textContent).toBe('Hello, reader.');
  });

  describe('features.docx in Reading', () => {
    it('has the title and headings at their levels', async () => {
      const root = await reading('features.docx');
      const headings = Array.from(root.querySelectorAll('h1, h2, h3'), (h) => [h.tagName, h.textContent]);
      expect(headings).toEqual([
        ['H1', 'Feature fixture'],
        ['H1', 'Heading one'],
        ['H2', 'Heading two'],
        ['H3', 'Heading three'],
        ['H1', 'Second page'],
      ]);
    });

    it('has the list items, table, Hindi text and images', async () => {
      const root = await reading('features.docx');
      const items = Array.from(root.querySelectorAll('li:not([id])'), (li) => li.firstChild?.textContent);
      expect(items).toEqual([
        'First numbered item',
        'Nested lettered item',
        'Second numbered item',
        'Bullet item',
        'Nested bullet item',
      ]);
      const table = root.querySelector('table');
      expect(table?.querySelectorAll('tr')).toHaveLength(4);
      expect(table?.textContent).toContain('Engineer');
      expect(table?.textContent).toContain('Designer');
      expect(root.textContent).toContain('हिन्दी पाठ');
      const sources = Array.from(root.querySelectorAll('img'), (img) => img.getAttribute('src') ?? '');
      expect(sources).toHaveLength(2);
      expect(sources.some((src) => src.startsWith('data:image/png'))).toBe(true);
      expect(sources.some((src) => src.startsWith('data:image/jpeg'))).toBe(true);
    });

    it('ends with the footnote and a link back, and moves the external link', async () => {
      const root = await reading('features.docx');
      const notes = root.querySelector('.dr-reading')?.lastElementChild;
      expect(notes?.tagName).toBe('OL');
      expect(notes?.textContent).toContain('This is footnote one, at the bottom of the page.');
      expect(notes?.querySelector('a[href^="#"]')).not.toBeNull();
      const link = root.querySelector('a[data-external-href]');
      expect(link?.getAttribute('data-external-href')).toBe('https://example.com/path?q=1');
      expect(link?.hasAttribute('href')).toBe(false);
    });
  });

  it('turns a bad zip into a corrupt DocumentError with the cause', async () => {
    const error = await docxAdapter.renderReading(fixture('truncated.docx'), ctx()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DocumentError);
    expect((error as DocumentError).code).toBe('corrupt');
    expect((error as DocumentError).cause).toBeDefined();
  });

  it('rejects when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(docxAdapter.renderReading(fixture('minimal.docx'), { signal: controller.signal })).rejects.toThrow();
  });

  it('reports corrupt when Layout cannot read the zip', async () => {
    const container = document.createElement('div');
    const error = await docxAdapter.renderLayout!(fixture('truncated.docx'), container, ctx()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DocumentError);
    expect((error as DocumentError).code).toBe('corrupt');
  });

  it('renders features.docx in Layout with two pages', async () => {
    const container = document.createElement('div');
    const { pageWidthPx } = await docxAdapter.renderLayout!(fixture('features.docx'), container, ctx());
    expect(pageWidthPx).toBe(794);
    expect(container.querySelectorAll('section.docx')).toHaveLength(2);
    expect(container.textContent).toContain('Fixture header text');
  });
});

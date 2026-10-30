import { describe, expect, it } from 'vitest';
import { readPage } from './odt-page';
import { readStyles } from './odt-styles';
import { contentXml, documents, stylesXml } from './odt-test-helpers';
import { NS } from './odt-xml';

const layout = (name: string, props: string) =>
  `<style:page-layout style:name="${name}"><style:page-layout-properties ${props}/></style:page-layout>`;

function page(body: string, parts: { styles?: string; automatic?: string; master?: string; contentStyles?: string }) {
  const { content, styles } = documents(contentXml(body, parts.contentStyles), stylesXml(parts));
  const text = content.getElementsByTagNameNS(NS.office, 'text')[0];
  if (!text) throw new Error('no text');
  return readPage(content, styles, readStyles(content, styles), text);
}

const LETTER =
  'fo:page-width="8.5in" fo:page-height="11in" fo:margin-top="1in" fo:margin-bottom="0.5in" fo:margin-left="0.75in" fo:margin-right="1.25in"';

describe('readPage', () => {
  it('reads the size and margins of the Standard master page', () => {
    const result = page('<text:p/>', {
      automatic: layout('pm1', LETTER),
      master: '<style:master-page style:name="Standard" style:page-layout-name="pm1"/>',
    });
    expect(result.widthMm).toBeCloseTo(215.9, 3);
    expect(result.heightMm).toBeCloseTo(279.4, 3);
    expect(result.marginTopMm).toBeCloseTo(25.4, 3);
    expect(result.marginBottomMm).toBeCloseTo(12.7, 3);
    expect(result.marginLeftMm).toBeCloseTo(19.05, 3);
    expect(result.marginRightMm).toBeCloseTo(31.75, 3);
  });

  it('uses the master page named by the first paragraph style that sets one', () => {
    const result = page('<text:p text:style-name="P1">x</text:p>', {
      automatic: layout('pm1', LETTER) + layout('pm2', 'fo:page-width="100mm" fo:page-height="150mm"'),
      master:
        '<style:master-page style:name="Standard" style:page-layout-name="pm1"/><style:master-page style:name="Cover" style:page-layout-name="pm2"/>',
      contentStyles: '<style:style style:name="P1" style:family="paragraph" style:master-page-name="Cover"/>',
    });
    expect(result.widthMm).toBe(100);
    expect(result.heightMm).toBe(150);
  });

  it('falls back to the first master page when there is no Standard', () => {
    const result = page('<text:p/>', {
      automatic: layout('pm1', 'fo:page-width="100mm" fo:page-height="150mm"'),
      master: '<style:master-page style:name="First" style:page-layout-name="pm1"/>',
    });
    expect(result.widthMm).toBe(100);
  });

  it('ignores a master page name that does not exist', () => {
    const result = page('<text:p text:style-name="P1">x</text:p>', {
      automatic: layout('pm1', 'fo:page-width="100mm" fo:page-height="150mm"'),
      master: '<style:master-page style:name="Standard" style:page-layout-name="pm1"/>',
      contentStyles: '<style:style style:name="P1" style:family="paragraph" style:master-page-name="Gone"/>',
    });
    expect(result.widthMm).toBe(100);
  });

  it('fills what is missing with A4 and 2.54 cm margins', () => {
    const missingValues = page('<text:p/>', {
      automatic: layout('pm1', 'fo:page-width="150mm" fo:margin-left="10mm"'),
      master: '<style:master-page style:name="Standard" style:page-layout-name="pm1"/>',
    });
    expect(missingValues).toEqual({
      widthMm: 150,
      heightMm: 297,
      marginTopMm: 25.4,
      marginRightMm: 25.4,
      marginBottomMm: 25.4,
      marginLeftMm: 10,
    });
    expect(page('<text:p/>', {})).toEqual({
      widthMm: 210,
      heightMm: 297,
      marginTopMm: 25.4,
      marginRightMm: 25.4,
      marginBottomMm: 25.4,
      marginLeftMm: 25.4,
    });
  });

  it('is A4 without a styles.xml', () => {
    const { content } = documents(contentXml('<text:p/>'));
    const text = content.getElementsByTagNameNS(NS.office, 'text')[0];
    if (!text) throw new Error('no text');
    expect(readPage(content, undefined, readStyles(content, undefined), text).widthMm).toBe(210);
  });
});

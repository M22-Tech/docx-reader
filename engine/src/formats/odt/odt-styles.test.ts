import { describe, expect, it } from 'vitest';
import { decodeStyleName, readStyles } from './odt-styles';
import { contentXml, documents, stylesXml } from './odt-test-helpers';

function styles(named: string, automatic = '', fonts = '') {
  const { content, styles: stylesDoc } = documents(
    contentXml('', automatic),
    stylesXml({ styles: named }).replace(
      '<office:styles>',
      `<office:font-face-decls>${fonts}</office:font-face-decls><office:styles>`,
    ),
  );
  return readStyles(content, stylesDoc);
}

const paragraphStyle = (name: string, attrs: string, inner = '') =>
  `<style:style style:name="${name}" style:family="paragraph" ${attrs}>${inner}</style:style>`;
const textStyle = (name: string, props: string, attrs = '') =>
  `<style:style style:name="${name}" style:family="text" ${attrs}><style:text-properties ${props}/></style:style>`;

describe('decodeStyleName', () => {
  it('turns _20_ into a space', () => {
    expect(decodeStyleName('Heading_20_1')).toBe('Heading 1');
    expect(decodeStyleName('Standard')).toBe('Standard');
  });
});

describe('paragraph styles', () => {
  it('layers the default style, the ancestors from the root down, and the style itself', () => {
    const resolved = styles(
      `<style:default-style style:family="paragraph"><style:text-properties fo:font-size="11pt" fo:color="#111111"/></style:default-style>` +
        paragraphStyle('Base', '', '<style:text-properties fo:font-size="12pt" fo:font-weight="bold"/>') +
        paragraphStyle('Mid', 'style:parent-style-name="Base"', '<style:text-properties fo:color="#222222"/>') +
        paragraphStyle('Leaf', 'style:parent-style-name="Mid"', '<style:text-properties fo:font-weight="normal"/>'),
    ).paragraph('Leaf');
    expect(resolved.text).toEqual({ bold: false, color: '#222222', fontSizePt: 12 });
  });

  it('lets automatic styles of content.xml use named styles as parents', () => {
    const resolved = styles(
      paragraphStyle('Named', '', '<style:paragraph-properties fo:text-align="center" fo:margin-left="1in"/>'),
      paragraphStyle('P1', 'style:parent-style-name="Named"', '<style:paragraph-properties fo:margin-left="0.5in"/>'),
    ).paragraph('P1');
    expect(resolved.para).toEqual({ align: 'center', marginLeftMm: 12.7 });
  });

  it('reads the paragraph properties', () => {
    const resolved = styles(
      paragraphStyle(
        'P',
        '',
        '<style:paragraph-properties fo:text-align="end" fo:margin-left="10mm" fo:margin-right="5mm" fo:text-indent="-4mm" fo:margin-top="12pt" fo:margin-bottom="6pt" fo:line-height="115%" fo:break-before="page"/>',
      ),
    ).paragraph('P');
    expect(resolved.para).toEqual({
      align: 'right',
      marginLeftMm: 10,
      marginRightMm: 5,
      textIndentMm: -4,
      marginTopPt: 12,
      marginBottomPt: 6,
      lineHeight: 1.15,
      breakBefore: true,
    });
  });

  it('maps every alignment value', () => {
    const align = (value: string) =>
      styles(paragraphStyle('P', '', `<style:paragraph-properties fo:text-align="${value}"/>`)).paragraph('P').para
        .align;
    expect(['start', 'left', 'end', 'right', 'center', 'justify', 'bogus'].map(align)).toEqual([
      'left',
      'left',
      'right',
      'right',
      'center',
      'justify',
      undefined,
    ]);
  });

  it('ignores a fixed line height and a break-before that is not a page', () => {
    const resolved = styles(
      paragraphStyle('P', '', '<style:paragraph-properties fo:line-height="0.5in" fo:break-before="column"/>'),
    ).paragraph('P');
    expect(resolved.para).toEqual({ breakBefore: false });
  });

  it('collects display names nearest first, falling back to the decoded name', () => {
    const resolved = styles(
      paragraphStyle('Standard', '') +
        paragraphStyle('Heading_20_1', 'style:display-name="Heading 1" style:parent-style-name="Standard"') +
        paragraphStyle('My_20_Style', 'style:parent-style-name="Heading_20_1"'),
      paragraphStyle('P1', 'style:parent-style-name="My_20_Style"'),
    ).paragraph('P1');
    expect(resolved.styleNames).toEqual(['P1', 'My Style', 'Heading 1', 'Standard']);
  });

  it('reads the outline level, list style and master page, where an empty value resets', () => {
    const resolved = styles(
      paragraphStyle('A', 'style:default-outline-level="2" style:list-style-name="L1" style:master-page-name="M1"') +
        paragraphStyle(
          'B',
          'style:parent-style-name="A" style:default-outline-level="" style:list-style-name="" style:master-page-name=""',
        ),
    );
    expect(resolved.paragraph('A')).toMatchObject({ outlineLevel: 2, listStyleName: 'L1', masterPageName: 'M1' });
    expect(resolved.paragraph('B')).toMatchObject({
      outlineLevel: undefined,
      listStyleName: undefined,
      masterPageName: undefined,
    });
  });

  it('survives a parent cycle and a missing parent', () => {
    const resolved = styles(
      paragraphStyle('A', 'style:parent-style-name="B"', '<style:text-properties fo:font-weight="bold"/>') +
        paragraphStyle('B', 'style:parent-style-name="A"') +
        paragraphStyle('C', 'style:parent-style-name="Nowhere"'),
    );
    expect(resolved.paragraph('A').text.bold).toBe(true);
    expect(resolved.paragraph('C').styleNames).toEqual(['C']);
    expect(resolved.paragraph('Unknown').styleNames).toEqual([]);
    expect(resolved.paragraph(undefined).text).toEqual({});
  });

  it('caches the resolved style', () => {
    const resolved = styles(paragraphStyle('A', ''));
    expect(resolved.paragraph('A')).toBe(resolved.paragraph('A'));
  });

  it('does not mix up styles of different families that share a name', () => {
    const resolved = styles(
      paragraphStyle('Same', '', '<style:text-properties fo:font-style="italic"/>') +
        textStyle('Same', 'fo:font-weight="bold"'),
    );
    expect(resolved.paragraph('Same').text).toEqual({ italic: true });
    expect(resolved.applyTextStyle({}, 'Same')).toEqual({ bold: true });
  });
});

describe('text properties', () => {
  const props = (attrs: string) => styles(textStyle('T', attrs)).applyTextStyle({}, 'T');

  it('reads bold at "bold" or weight 600 and above', () => {
    expect(props('fo:font-weight="bold"').bold).toBe(true);
    expect(props('fo:font-weight="600"').bold).toBe(true);
    expect(props('fo:font-weight="900"').bold).toBe(true);
    expect(props('fo:font-weight="500"').bold).toBe(false);
    expect(props('fo:font-weight="normal"').bold).toBe(false);
    expect(props('fo:font-weight="bolder"').bold).toBeUndefined();
  });

  it('reads italic, underline and strikethrough, where "none" switches them off', () => {
    expect(props('fo:font-style="italic"').italic).toBe(true);
    expect(props('fo:font-style="oblique"').italic).toBe(true);
    expect(props('fo:font-style="normal"').italic).toBe(false);
    expect(props('style:text-underline-style="solid"').underline).toBe(true);
    expect(props('style:text-underline-style="none"').underline).toBe(false);
    expect(props('style:text-line-through-style="solid"').strike).toBe(true);
    expect(props('style:text-line-through-style="none"').strike).toBe(false);
  });

  it('reads the text position', () => {
    const position = (value: string) => props(`style:text-position="${value}"`).position;
    expect(['super', 'super 58%', '33% 58%', 'sub', 'sub 58%', '-33% 58%', '0% 100%', 'bogus'].map(position)).toEqual([
      'super',
      'super',
      'super',
      'sub',
      'sub',
      'sub',
      'normal',
      undefined,
    ]);
  });

  it('reads colours as lower case #rrggbb and drops the rest', () => {
    expect(props('fo:color="#C00000"').color).toBe('#c00000');
    expect(props('fo:color="red"').color).toBeUndefined();
    expect(props('fo:background-color="#FFFF00"').background).toBe('#ffff00');
    expect(props('fo:background-color="transparent"').background).toBe('transparent');
  });

  it('looks a font name up in the font declarations and strips quotes', () => {
    const resolved = styles(
      textStyle('T', 'style:font-name="Courier New"') +
        textStyle('U', 'style:font-name="Unlisted"') +
        textStyle('V', `fo:font-family="'Open Sans'"`),
      '',
      `<style:font-face style:name="Courier New" svg:font-family="&apos;Courier New&apos;"/>`,
    );
    expect(resolved.applyTextStyle({}, 'T').fontFamily).toBe('Courier New');
    expect(resolved.applyTextStyle({}, 'U').fontFamily).toBe('Unlisted');
    expect(resolved.applyTextStyle({}, 'V').fontFamily).toBe('Open Sans');
  });

  it('reads a font size in points, or a percent of the inherited size', () => {
    const resolved = styles(
      textStyle('Abs', 'fo:font-size="14pt"') +
        textStyle('Pct', 'fo:font-size="50%"') +
        textStyle('In', 'fo:font-size="0.25in"'),
    );
    expect(resolved.applyTextStyle({}, 'Abs').fontSizePt).toBe(14);
    expect(resolved.applyTextStyle({ fontSizePt: 20 }, 'Pct').fontSizePt).toBe(10);
    expect(resolved.applyTextStyle({}, 'Pct').fontSizePt).toBeUndefined();
    expect(resolved.applyTextStyle({}, 'In').fontSizePt).toBe(18);
  });

  it('lays a span style over the paragraph properties and resolves its ancestors', () => {
    const resolved = styles(
      textStyle('Parent', 'fo:font-weight="bold" fo:color="#ff0000"') +
        textStyle('Child', 'fo:color="#00ff00"', 'style:parent-style-name="Parent"'),
    );
    expect(resolved.applyTextStyle({ italic: true, color: '#000000' }, 'Child')).toEqual({
      italic: true,
      bold: true,
      color: '#00ff00',
    });
    expect(resolved.applyTextStyle({ bold: true }, undefined)).toEqual({ bold: true });
    expect(resolved.applyTextStyle({ bold: true }, 'Unknown')).toEqual({ bold: true });
  });
});

describe('table styles', () => {
  const tableStyles = styles(
    '',
    `<style:style style:name="T1" style:family="table"><style:table-properties style:rel-width="80%"/></style:style>
     <style:style style:name="T2" style:family="table"><style:table-properties style:width="5in"/></style:style>
     <style:style style:name="C1" style:family="table-column"><style:table-column-properties style:column-width="2in" style:rel-column-width="100*"/></style:style>
     <style:style style:name="C2" style:family="table-column"><style:table-column-properties style:rel-column-width="21845*"/></style:style>
     <style:style style:name="D1" style:family="table-cell"><style:table-cell-properties fo:background-color="#DDEEFF"/></style:style>
     <style:style style:name="D2" style:family="table-cell"><style:table-cell-properties fo:background-color="transparent"/></style:style>`,
  );

  it('reads column widths, relative or absolute', () => {
    expect(tableStyles.column('C1')).toEqual({ widthMm: 50.8, relative: 100 });
    expect(tableStyles.column('C2')).toEqual({ relative: 21845 });
    expect(tableStyles.column('Unknown')).toEqual({});
    expect(tableStyles.column(undefined)).toEqual({});
  });

  it('reads the relative table width', () => {
    expect(tableStyles.tableRelWidthPercent('T1')).toBe(80);
    expect(tableStyles.tableRelWidthPercent('T2')).toBeUndefined();
    expect(tableStyles.tableRelWidthPercent(undefined)).toBeUndefined();
  });

  it('reads a cell background unless it is transparent', () => {
    expect(tableStyles.cellBackground('D1')).toBe('#ddeeff');
    expect(tableStyles.cellBackground('D2')).toBeUndefined();
    expect(tableStyles.cellBackground(undefined)).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import type { Block, Inline, Paragraph, Table } from '../../model/document-model';
import { imagePaths, internalImagePath } from './odt-body';
import { element, JPEG_BYTES, PNG_BYTES, walk } from './odt-test-helpers';
import { NS } from './odt-xml';

const paragraphs = (blocks: Block[]): Paragraph[] => blocks.filter((b): b is Paragraph => b.kind === 'paragraph');
const textOf = (inlines: Inline[]): string =>
  inlines.map((i) => (i.kind === 'text' ? i.text : i.kind === 'link' ? textOf(i.inlines) : '')).join('');
const only = (blocks: Block[]): Paragraph => {
  const [first] = paragraphs(blocks);
  if (blocks.length !== 1 || !first) throw new Error(`expected one paragraph, got ${blocks.length} blocks`);
  return first;
};
const table = (blocks: Block[]): Table => {
  const [first] = blocks;
  if (first?.kind !== 'table') throw new Error('expected a table');
  return first;
};
const cellText = (t: Table) =>
  t.rows.map((row) => row.cells.map((cell) => textOf(paragraphs(cell.blocks)[0]?.inlines ?? [])));

describe('text', () => {
  it('turns text:s into spaces, one by default', () => {
    const { blocks } = walk('<text:p>a<text:s text:c="3"/>b<text:s/>c</text:p>');
    expect(only(blocks).inlines).toEqual([{ kind: 'text', text: 'a   b c' }]);
  });

  it('collapses white space and drops it at the start of the paragraph', () => {
    const { blocks } = walk('<text:p>  a \n\t b  <text:span text:style-name="x"> c</text:span>  </text:p>');
    expect(textOf(only(blocks).inlines)).toBe('a b c ');
  });

  it('keeps the spaces of text:s next to ordinary white space', () => {
    const { blocks } = walk('<text:p>a <text:s text:c="2"/> b</text:p>');
    expect(textOf(only(blocks).inlines)).toBe('a    b');
  });

  it('makes tabs and line breaks, and ignores soft page breaks', () => {
    const { blocks } = walk('<text:p>a<text:tab/>b<text:line-break/>c<text:soft-page-break/>d</text:p>');
    expect(only(blocks).inlines.map((i) => i.kind)).toEqual(['text', 'tab', 'text', 'lineBreak', 'text']);
    expect(textOf(only(blocks).inlines)).toBe('abcd');
  });

  it('shows the text of fields and unknown inline wrappers', () => {
    const { blocks } = walk(
      '<text:p>Page <text:page-number>3</text:page-number> of <text:sequence>7</text:sequence> on <text:date>1 May</text:date> <text:meta>m</text:meta></text:p>',
    );
    expect(textOf(only(blocks).inlines)).toBe('Page 3 of 7 on 1 May m');
  });

  it('leaves out tracked changes, annotations and other namespaces', () => {
    const { blocks } = walk(
      `<text:tracked-changes><text:changed-region><text:deletion><text:p>Deleted paragraph</text:p></text:deletion></text:changed-region></text:tracked-changes>
       <text:p>Kept<text:change-start/> text<office:annotation><text:p>comment</text:p></office:annotation></text:p>`,
    );
    expect(textOf(only(blocks).inlines)).toBe('Kept text');
  });

  it('merges text of equal marks and keeps spans apart', () => {
    const { blocks } = walk(
      '<text:p>a<text:span text:style-name="B">b</text:span><text:span text:style-name="B">c</text:span>d</text:p>',
      {
        automatic:
          '<style:style style:name="B" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>',
      },
    );
    expect(only(blocks).inlines).toEqual([
      { kind: 'text', text: 'a' },
      { kind: 'text', text: 'bc', marks: { bold: true } },
      { kind: 'text', text: 'd' },
    ]);
  });

  it('applies a span on top of the paragraph style, and marks nested spans', () => {
    const { blocks } = walk(
      '<text:p text:style-name="P"><text:span text:style-name="I">x<text:span text:style-name="B">y</text:span></text:span></text:p>',
      {
        automatic:
          '<style:style style:name="P" style:family="paragraph"><style:text-properties fo:color="#ff0000" fo:font-size="14pt"/></style:style>' +
          '<style:style style:name="I" style:family="text"><style:text-properties fo:font-style="italic"/></style:style>' +
          '<style:style style:name="B" style:family="text"><style:text-properties fo:font-weight="bold" fo:color="#00ff00"/></style:style>',
      },
    );
    expect(only(blocks).inlines).toEqual([
      { kind: 'text', text: 'x', marks: { italic: true, color: '#ff0000', fontSizePt: 14 } },
      { kind: 'text', text: 'y', marks: { italic: true, bold: true, color: '#00ff00', fontSizePt: 14 } },
    ]);
  });

  it('leaves out the font size when it is the 11 pt default', () => {
    const { blocks } = walk('<text:p text:style-name="P">x</text:p>', {
      automatic:
        '<style:style style:name="P" style:family="paragraph"><style:text-properties fo:font-size="11pt"/></style:style>',
    });
    expect(only(blocks).inlines).toEqual([{ kind: 'text', text: 'x' }]);
  });
});

describe('paragraphs', () => {
  it('reads the paragraph formatting, leaving out defaults', () => {
    const { blocks } = walk('<text:p text:style-name="P">x</text:p><text:p text:style-name="Q">y</text:p>', {
      automatic:
        '<style:style style:name="P" style:family="paragraph"><style:paragraph-properties fo:text-align="end" fo:margin-left="10mm" fo:margin-right="5mm" fo:text-indent="-4mm" fo:margin-top="12pt" fo:margin-bottom="0pt" fo:line-height="150%"/></style:style>' +
        '<style:style style:name="Q" style:family="paragraph"><style:paragraph-properties fo:text-align="start" fo:margin-left="0mm" fo:line-height="100%"/></style:style>',
    });
    const [p, q] = paragraphs(blocks);
    expect(p).toEqual({
      kind: 'paragraph',
      align: 'right',
      indentLeftMm: 10,
      indentRightMm: 5,
      firstLineMm: -4,
      spaceBeforePt: 12,
      lineHeight: 1.5,
      inlines: [{ kind: 'text', text: 'x' }],
    });
    expect(q).toEqual({ kind: 'paragraph', inlines: [{ kind: 'text', text: 'y' }] });
  });

  it('makes text:h a heading, level 1 by default and 6 at most', () => {
    const { blocks } = walk(
      '<text:h text:outline-level="2">a</text:h><text:h>b</text:h><text:h text:outline-level="9">c</text:h>',
    );
    expect(paragraphs(blocks).map((p) => p.headingLevel)).toEqual([2, 1, 6]);
  });

  it('makes a text:p a heading from its style name, an ancestor name or an outline level', () => {
    const { blocks } = walk(
      '<text:p text:style-name="Title">a</text:p><text:p text:style-name="Heading_20_2">b</text:p><text:p text:style-name="P1">c</text:p><text:p text:style-name="Outlined">d</text:p><text:p text:style-name="Plain">e</text:p>',
      {
        styles:
          '<style:style style:name="Title" style:family="paragraph"/>' +
          '<style:style style:name="Heading_20_2" style:display-name="Heading 2" style:family="paragraph"/>' +
          '<style:style style:name="Outlined" style:family="paragraph" style:default-outline-level="3"/>' +
          '<style:style style:name="Plain" style:family="paragraph"/>',
        automatic: '<style:style style:name="P1" style:family="paragraph" style:parent-style-name="Heading_20_2"/>',
      },
    );
    expect(paragraphs(blocks).map((p) => p.headingLevel)).toEqual([1, 2, 2, 3, undefined]);
  });

  it('puts a page break before a paragraph whose style breaks before', () => {
    const { blocks } = walk('<text:p>first</text:p><text:p text:style-name="Break">second</text:p>', {
      automatic:
        '<style:style style:name="Break" style:family="paragraph"><style:paragraph-properties fo:break-before="page"/></style:style>',
    });
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'pageBreak', 'paragraph']);
  });

  it('puts no page break at the very start', () => {
    const { blocks } = walk('<text:p text:style-name="Break">first</text:p>', {
      automatic:
        '<style:style style:name="Break" style:family="paragraph"><style:paragraph-properties fo:break-before="page"/></style:style>',
    });
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph']);
  });

  it('shows sections, tables of contents and their bodies in place and skips their definitions', () => {
    const { blocks } = walk(
      `<text:section><text:p>in section</text:p></text:section>
       <text:table-of-content>
         <text:table-of-content-source><text:index-title-template>Template</text:index-title-template></text:table-of-content-source>
         <text:index-body><text:index-title><text:p>Contents</text:p></text:index-title><text:p>Entry<text:tab/>1</text:p></text:index-body>
       </text:table-of-content>`,
    );
    expect(paragraphs(blocks).map((p) => textOf(p.inlines))).toEqual(['in section', 'Contents', 'Entry1']);
  });
});

describe('links, anchors and notes', () => {
  it('makes a link around its content and keeps the marks inside', () => {
    const { blocks } = walk(
      '<text:p>go <text:a xlink:href="https://example.com/a?b=1"><text:span text:style-name="B">here</text:span></text:a></text:p>',
      {
        automatic:
          '<style:style style:name="B" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>',
      },
    );
    expect(only(blocks).inlines[1]).toEqual({
      kind: 'link',
      href: 'https://example.com/a?b=1',
      inlines: [{ kind: 'text', text: 'here', marks: { bold: true } }],
    });
  });

  it('keeps an internal link as it is and shows the text of a link without href', () => {
    const { blocks } = walk('<text:p><text:a xlink:href="#Target">a</text:a><text:a>b</text:a></text:p>');
    expect(only(blocks).inlines).toEqual([
      { kind: 'link', href: '#Target', inlines: [{ kind: 'text', text: 'a' }] },
      { kind: 'text', text: 'b' },
    ]);
  });

  it('makes anchors from bookmarks and bookmark starts', () => {
    const { blocks } = walk(
      '<text:p><text:bookmark text:name="One"/>a<text:bookmark-start text:name="Two"/>b<text:bookmark-end text:name="Two"/><text:bookmark/></text:p>',
    );
    expect(only(blocks).inlines.filter((i) => i.kind === 'anchor')).toEqual([
      { kind: 'anchor', id: 'One' },
      { kind: 'anchor', id: 'Two' },
    ]);
  });

  it('moves note bodies to the notes in reference order', () => {
    const { blocks, notes } = walk(
      `<text:p>a<text:note text:note-class="footnote"><text:note-citation>1</text:note-citation><text:note-body><text:p>First note</text:p></text:note-body></text:note>
       b<text:note text:note-class="endnote"><text:note-citation>i</text:note-citation><text:note-body><text:p>Second note</text:p></text:note-body></text:note></text:p>`,
    );
    const refs = only(blocks).inlines.filter((i) => i.kind === 'noteRef');
    expect(refs).toEqual([
      { kind: 'noteRef', noteId: '1', label: '1' },
      { kind: 'noteRef', noteId: '2', label: 'i' },
    ]);
    expect(notes.map((n) => [n.id, n.label, textOf(paragraphs(n.blocks)[0]?.inlines ?? [])])).toEqual([
      ['1', '1', 'First note'],
      ['2', 'i', 'Second note'],
    ]);
  });

  it('numbers a note without a citation by its position', () => {
    const { notes } = walk(
      '<text:p><text:note><text:note-body><text:p>x</text:p></text:note-body></text:note></text:p>',
    );
    expect(notes[0]?.label).toBe('1');
  });
});

describe('lists', () => {
  const listStyles =
    '<text:list-style style:name="Num"><text:list-level-style-number text:level="1" style:num-format="1" style:num-suffix="."/><text:list-level-style-number text:level="2" style:num-format="a" style:num-suffix=")"/></text:list-style>';
  const markers = (blocks: Block[]) => paragraphs(blocks).map((p) => p.list?.marker);

  it('numbers items, nested levels and the paragraphs after the first of an item', () => {
    const { blocks } = walk(
      `<text:list text:style-name="Num">
         <text:list-item><text:p>a</text:p><text:p>a2</text:p><text:list><text:list-item><text:p>b</text:p></text:list-item></text:list></text:list-item>
         <text:list-item><text:p>c</text:p></text:list-item>
       </text:list>`,
      { styles: listStyles },
    );
    expect(markers(blocks)).toEqual(['1.', '', 'a)', '2.']);
    expect(paragraphs(blocks).map((p) => p.list?.level)).toEqual([0, 0, 1, 0]);
  });

  it('gives a list header no marker and does not count it', () => {
    const { blocks } = walk(
      '<text:list text:style-name="Num"><text:list-header><text:p>Header</text:p></text:list-header><text:list-item><text:p>one</text:p></text:list-item></text:list>',
      { styles: listStyles },
    );
    expect(markers(blocks)).toEqual(['', '1.']);
  });

  it('applies a list-item start value', () => {
    const { blocks } = walk(
      '<text:list text:style-name="Num"><text:list-item text:start-value="5"><text:p>x</text:p></text:list-item><text:list-item><text:p>y</text:p></text:list-item></text:list>',
      { styles: listStyles },
    );
    expect(markers(blocks)).toEqual(['5.', '6.']);
  });

  it('keeps counting in a list that continues the previous one with continue-numbering', () => {
    const list = (attrs: string, text: string) =>
      `<text:list text:style-name="Num" ${attrs}><text:list-item><text:p>${text}</text:p></text:list-item></text:list>`;
    const { blocks } = walk(
      list('', 'one') +
        '<text:p>between</text:p>' +
        list('text:continue-numbering="true"', 'two') +
        list('', 'restart'),
      { styles: listStyles },
    );
    expect(markers(blocks)).toEqual(['1.', undefined, '2.', '1.']);
  });

  it('continues the list named by continue-list', () => {
    const { blocks } = walk(
      `<text:list xml:id="a" text:style-name="Num"><text:list-item><text:p>one</text:p></text:list-item></text:list>
       <text:list xml:id="b" text:style-name="Num"><text:list-item><text:p>other</text:p></text:list-item></text:list>
       <text:list text:continue-list="a" text:style-name="Num"><text:list-item><text:p>two</text:p></text:list-item></text:list>`,
      { styles: listStyles },
    );
    expect(markers(blocks)).toEqual(['1.', '1.', '2.']);
  });

  it('takes the list style from the paragraph style when the list names none', () => {
    const { blocks } = walk(
      '<text:list><text:list-item><text:p text:style-name="PL">x</text:p></text:list-item></text:list>',
      {
        styles: listStyles,
        automatic: '<style:style style:name="PL" style:family="paragraph" style:list-style-name="Num"/>',
      },
    );
    expect(markers(blocks)).toEqual(['1.']);
  });

  it('indents from the list level unless the paragraph style sets the indent', () => {
    const levelIndents =
      '<text:list-style style:name="L"><text:list-level-style-bullet text:level="1" text:bullet-char="•"><style:list-level-properties><style:list-level-label-alignment fo:margin-left="10mm" fo:text-indent="-5mm"/></style:list-level-properties></text:list-level-style-bullet></text:list-style>';
    const { blocks } = walk(
      '<text:list text:style-name="L"><text:list-item><text:p>a</text:p></text:list-item><text:list-item><text:p text:style-name="Own">b</text:p></text:list-item></text:list>',
      {
        styles: levelIndents,
        automatic:
          '<style:style style:name="Own" style:family="paragraph"><style:paragraph-properties fo:margin-left="20mm"/></style:style>',
      },
    );
    const [a, b] = paragraphs(blocks);
    expect([a?.indentLeftMm, a?.firstLineMm]).toEqual([10, -5]);
    expect([b?.indentLeftMm, b?.firstLineMm]).toEqual([20, -5]);
  });

  it('starts counting afresh in a list inside a table cell', () => {
    const { blocks } = walk(
      `<text:list text:style-name="Num"><text:list-item><text:p>outer</text:p>
         <table:table><table:table-row><table:table-cell><text:list text:style-name="Num"><text:list-item><text:p>inner</text:p></text:list-item></text:list></table:table-cell></table:table-row></table:table>
       </text:list-item></text:list>`,
      { styles: listStyles },
    );
    const inner = table(blocks.slice(1)).rows[0]?.cells[0]?.blocks[0] as Paragraph;
    expect(inner.list).toMatchObject({ level: 0, marker: '1.' });
  });
});

describe('tables', () => {
  const cell = (text: string, attrs = '') => `<table:table-cell ${attrs}><text:p>${text}</text:p></table:table-cell>`;

  it('reads rows, header rows, spans and covered cells', () => {
    const { blocks } = walk(
      `<table:table>
         <table:table-column table:number-columns-repeated="3"/>
         <table:table-header-rows><table:table-row>${cell('h1')}${cell('h2')}${cell('h3')}</table:table-row></table:table-header-rows>
         <table:table-row>${cell('a')}${cell('b', 'table:number-rows-spanned="2"')}${cell('c')}</table:table-row>
         <table:table-row>${cell('d', 'table:number-columns-spanned="2"')}<table:covered-table-cell/>${cell('e')}</table:table-row>
       </table:table>`,
    );
    const t = table(blocks);
    expect(cellText(t)).toEqual([
      ['h1', 'h2', 'h3'],
      ['a', 'b', 'c'],
      ['d', 'e'],
    ]);
    expect(t.rows.map((r) => r.header)).toEqual([true, undefined, undefined]);
    expect(t.rows[1]?.cells[1]?.rowSpan).toBe(2);
    expect(t.rows[2]?.cells[0]?.colSpan).toBe(2);
    expect(t.rows[0]?.cells[0]?.colSpan).toBeUndefined();
  });

  it('reads rows inside row groups and expands repeated rows and cells, capped at 1000', () => {
    const { blocks } = walk(
      `<table:table>
         <table:table-rows><table:table-row table:number-rows-repeated="3">${cell('r', 'table:number-columns-repeated="2"')}</table:table-row></table:table-rows>
         <table:table-row table:number-rows-repeated="999999999">${cell('big')}</table:table-row>
       </table:table>`,
    );
    const t = table(blocks);
    expect(t.rows).toHaveLength(3 + 1000);
    expect(t.rows[0]?.cells).toHaveLength(2);
  });

  it('puts the blocks of a cell in it, nested tables included', () => {
    const { blocks } = walk(
      `<table:table><table:table-row><table:table-cell><text:p>one</text:p><text:p>two</text:p>
         <table:table><table:table-row>${cell('inner')}</table:table-row></table:table></table:table-cell></table:table-row></table:table>`,
    );
    const blocksInCell = table(blocks).rows[0]?.cells[0]?.blocks ?? [];
    expect(blocksInCell.map((b) => b.kind)).toEqual(['paragraph', 'paragraph', 'table']);
  });

  it('reads the cell background from the cell style', () => {
    const { blocks } = walk(
      `<table:table><table:table-row>${cell('x', 'table:style-name="Shade"')}${cell('y')}</table:table-row></table:table>`,
      {
        automatic:
          '<style:style style:name="Shade" style:family="table-cell"><style:table-cell-properties fo:background-color="#FFEEDD"/></style:style>',
      },
    );
    const [shaded, plain] = table(blocks).rows[0]?.cells ?? [];
    expect(shaded?.background).toBe('#ffeedd');
    expect(plain?.background).toBeUndefined();
  });

  const columnStyles =
    '<style:style style:name="Abs" style:family="table-column"><style:table-column-properties style:column-width="30mm"/></style:style>' +
    '<style:style style:name="R1" style:family="table-column"><style:table-column-properties style:rel-column-width="1*"/></style:style>' +
    '<style:style style:name="R3" style:family="table-column"><style:table-column-properties style:rel-column-width="3*"/></style:style>' +
    '<style:style style:name="Half" style:family="table"><style:table-properties style:rel-width="50%"/></style:style>';
  const columns = (names: string[], tableStyle = '') =>
    `<table:table ${tableStyle}>${names.map((n) => `<table:table-column table:style-name="${n}"/>`).join('')}<table:table-row>${cell('x')}</table:table-row></table:table>`;

  it('uses absolute column widths as they are', () => {
    const { blocks } = walk(columns(['Abs', 'Abs']), { automatic: columnStyles });
    expect(table(blocks).columnWidthsMm).toEqual([30, 30]);
  });

  it('shares the table width between relative columns', () => {
    const { blocks } = walk(columns(['R1', 'R3']), { automatic: columnStyles, textWidthMm: 160 });
    expect(table(blocks).columnWidthsMm).toEqual([40, 120]);
  });

  it('takes the table width from the table style rel-width', () => {
    const { blocks } = walk(columns(['R1', 'R3'], 'table:style-name="Half"'), {
      automatic: columnStyles,
      textWidthMm: 160,
    });
    expect(table(blocks).columnWidthsMm).toEqual([20, 60]);
  });

  it('gives relative columns what the absolute ones leave', () => {
    const { blocks } = walk(columns(['Abs', 'R1', 'R3']), { automatic: columnStyles, textWidthMm: 160 });
    expect(table(blocks).columnWidthsMm).toEqual([30, 32.5, 97.5]);
  });

  it('gives no widths when a column has none or the table has no columns', () => {
    expect(table(walk(columns(['Abs', 'Missing']), { automatic: columnStyles }).blocks).columnWidthsMm).toBeUndefined();
    expect(table(walk(columns([]), { automatic: columnStyles }).blocks).columnWidthsMm).toBeUndefined();
  });
});

describe('images', () => {
  const frame = (href: string, size = 'svg:width="2in" svg:height="1in"', extra = '') =>
    `<text:p><draw:frame ${size}><draw:image xlink:href="${href}"/>${extra}</draw:frame></text:p>`;

  it('reads the picture bytes, the MIME type from them, and the frame size in pixels', () => {
    const { blocks } = walk(frame('Pictures/a.png') + frame('Pictures/b.jpg'), {
      images: { 'Pictures/a.png': PNG_BYTES, 'Pictures/b.jpg': JPEG_BYTES },
    });
    const images = paragraphs(blocks).map((p) => p.inlines[0]);
    expect(images).toEqual([
      { kind: 'image', widthPx: 192, heightPx: 96, src: { mime: 'image/png', data: PNG_BYTES } },
      { kind: 'image', widthPx: 192, heightPx: 96, src: { mime: 'image/jpeg', data: JPEG_BYTES } },
    ]);
  });

  it('recognises GIF and BMP by their first bytes', () => {
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    const bmp = new Uint8Array([0x42, 0x4d, 0, 0]);
    const { blocks } = walk(frame('Pictures/a.gif') + frame('Pictures/b.bmp'), {
      images: { 'Pictures/a.gif': gif, 'Pictures/b.bmp': bmp },
    });
    const mimes = paragraphs(blocks).map((p) => (p.inlines[0]?.kind === 'image' ? p.inlines[0].src?.mime : undefined));
    expect(mimes).toEqual(['image/gif', 'image/bmp']);
  });

  it('keeps the size and gives no src for an external href', () => {
    const { blocks } = walk(
      frame('https://example.com/a.png') + frame('file:///etc/a.png') + frame('../a.png') + frame('/a.png'),
      {
        images: { 'a.png': PNG_BYTES },
      },
    );
    for (const p of paragraphs(blocks)) expect(p.inlines).toEqual([{ kind: 'image', widthPx: 192, heightPx: 96 }]);
  });

  it('gives no src for a picture that is missing or in a format the page cannot show', () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
    const { blocks } = walk(frame('Pictures/missing.png') + frame('Pictures/a.svg') + frame('Pictures/a.wmf'), {
      images: { 'Pictures/a.svg': svg, 'Pictures/a.wmf': new Uint8Array([0xd7, 0xcd, 0xc6, 0x9a]) },
    });
    for (const p of paragraphs(blocks)) expect(p.inlines[0]).toEqual({ kind: 'image', widthPx: 192, heightPx: 96 });
  });

  it('reads the alt text from the frame description or title, and uses a default size without svg sizes', () => {
    const { blocks } = walk(
      frame('Pictures/a.png', 'svg:width="50%"', '<svg:title>Title</svg:title><svg:desc>Description</svg:desc>') +
        frame('Pictures/a.png', '', '<svg:title>Only title</svg:title>'),
      { images: { 'Pictures/a.png': PNG_BYTES } },
    );
    const [first, second] = paragraphs(blocks).map((p) => p.inlines[0]);
    expect(first).toMatchObject({ widthPx: 96, heightPx: 96, alt: 'Description' });
    expect(second).toMatchObject({ alt: 'Only title' });
  });

  it('skips a frame that holds a text box or no image', () => {
    const { blocks } = walk(
      '<text:p>a<draw:frame><draw:text-box><text:p>boxed</text:p></draw:text-box></draw:frame><draw:frame><draw:object/></draw:frame><draw:custom-shape/>b</text:p>',
    );
    expect(only(blocks).inlines).toEqual([{ kind: 'text', text: 'ab' }]);
  });
});

describe('image paths', () => {
  it('accepts paths inside the zip only', () => {
    expect(internalImagePath('Pictures/a.png')).toBe('Pictures/a.png');
    expect(internalImagePath('./Pictures/a.png')).toBe('Pictures/a.png');
    for (const href of [
      'http://x/a.png',
      'data:image/png;base64,AA',
      'C:\\a.png',
      '/a.png',
      '\\a.png',
      '#x',
      '../a.png',
      'a/../../b.png',
      '',
      '  ',
    ]) {
      expect(internalImagePath(href), href).toBeUndefined();
    }
    expect(internalImagePath(undefined)).toBeUndefined();
  });

  it('lists the distinct internal pictures of a body', () => {
    const body = element(
      `<office:text><draw:image xlink:href="Pictures/a.png"/><draw:image xlink:href="Pictures/a.png"/><draw:image xlink:href="https://x/b.png"/><draw:image xlink:href="Pictures/c.jpg"/></office:text>`,
    ).getElementsByTagNameNS(NS.office, 'text')[0];
    if (!body) throw new Error('no body');
    expect(imagePaths(body)).toEqual(['Pictures/a.png', 'Pictures/c.jpg']);
  });
});

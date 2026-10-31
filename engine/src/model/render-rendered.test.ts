import { describe, expect, it } from 'vitest';
import { renderRendered } from './render-rendered';
import {
  anchor,
  cell,
  fullModel,
  image,
  link,
  model,
  noteRef,
  para,
  PNG_BASE64,
  pngImage,
  row,
  run,
  table,
  toDom,
} from './test-models';

function render(...args: Parameters<typeof model>) {
  return toDom(renderRendered(model(...args)));
}

describe('renderRendered', () => {
  it('wraps the content in dr-rendered', () => {
    const dom = render([para('x')]);
    expect(dom.firstElementChild?.className).toBe('dr-rendered');
    expect(dom.querySelector('.dr-rendered > p')?.textContent).toBe('x');
  });

  it('writes no style attribute for any kind of content', () => {
    const full = fullModel();
    full.blocks.push(
      para('x', { align: 'right', indentLeftMm: 5, spaceAfterPt: 3, lineHeight: 2 }),
      para([image(30, 20), run('c', { color: '#ff0000', highlight: '#ffff00', fontFamily: 'Arial', fontSizePt: 20 })]),
      table([row([cell('a', { widthMm: 40, background: '#cccccc' })])], [40]),
    );
    const dom = toDom(renderRendered(full));
    expect(dom.querySelectorAll('[style]')).toHaveLength(0);
    expect(dom.querySelector('colgroup')).toBeNull();
    expect(dom.querySelector('span:not([class])')).toBeNull();
  });

  it('keeps only center and right alignment, as classes', () => {
    const dom = render([
      para('c', { align: 'center' }),
      para('r', { align: 'right' }),
      para('j', { align: 'justify' }),
      para('l', { align: 'left' }),
    ]);
    const classes = [...dom.querySelectorAll('p')].map((p) => p.className);
    expect(classes).toEqual(['dr-center', 'dr-right', '', '']);
  });

  it('renders headings and marks as tags', () => {
    const dom = render([
      para('Head', { headingLevel: 2 }),
      para([run('b', { bold: true, italic: true }), run('s', { subscript: true })]),
    ]);
    expect(dom.querySelector('h2')?.textContent).toBe('Head');
    expect(dom.querySelector('h2')?.hasAttribute('class')).toBe(false);
    expect(dom.querySelector('em > strong')?.textContent).toBe('b');
    expect(dom.querySelector('sub')?.textContent).toBe('s');
  });

  it('leaves empty paragraphs out but keeps their index', () => {
    const dom = render([para(''), para([run('')]), para('kept'), para('')]);
    const paragraphs = dom.querySelectorAll('p');
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]?.getAttribute('data-block')).toBe('2');
  });

  it('keeps the anchors of an empty paragraph', () => {
    const dom = render([para([anchor('here')]), para([link('#here', run('go'))])]);
    expect(dom.querySelector('a.dr-anchor')?.id).toBe('dr-bm-here');
  });

  it('gives list paragraphs data-level and a marker', () => {
    const dom = render([
      para('one', { list: { level: 0, marker: '1.', ordered: true } }),
      para('deep', { list: { level: 3, marker: '•', ordered: false }, align: 'center' }),
    ]);
    const [first, second] = dom.querySelectorAll('p');
    expect(first?.getAttribute('data-level')).toBe('0');
    expect(first?.classList.contains('dr-li')).toBe(true);
    expect(first?.querySelector('.dr-marker')?.textContent).toBe('1.');
    expect(second?.getAttribute('data-level')).toBe('3');
    expect(second?.classList.contains('dr-center')).toBe(true);
  });

  it('renders line breaks as br and tabs as a space', () => {
    const dom = render([para([run('a'), { kind: 'lineBreak' }, run('b'), { kind: 'tab' }, run('c')])]);
    const p = dom.querySelector('p')!;
    expect(p.querySelectorAll('br')).toHaveLength(1);
    expect(p.textContent).toBe('ab c');
    expect(p.querySelector('.dr-tab')).toBeNull();
  });

  it('renders a page break', () => {
    expect(render([{ kind: 'pageBreak' }]).querySelector('hr.dr-page-break[data-block="0"]')).not.toBeNull();
  });

  it('renders links, anchors and notes like Raw', () => {
    const dom = render(
      [
        para([
          anchor('a'),
          link('#a', run('in')),
          link('https://e.com/', run('out')),
          noteRef('n', '1'),
          noteRef('n', '1'),
        ]),
      ],
      {
        notes: [{ id: 'n', label: '1', blocks: [para('Note body')] }],
      },
    );
    expect(dom.querySelector('a.dr-anchor')?.id).toBe('dr-bm-a');
    expect(dom.querySelector('a[href="#dr-bm-a"]')?.textContent).toBe('in');
    expect(dom.querySelector('a[href="https://e.com/"]')?.textContent).toBe('out');
    const refs = dom.querySelectorAll('sup.dr-noteref > a');
    expect(refs[0]?.id).toBe('dr-noteref-n');
    expect(refs[1]?.hasAttribute('id')).toBe(false);
    const note = dom.querySelector('section.dr-notes > .dr-note')!;
    expect(note.id).toBe('dr-note-n');
    expect(note.querySelector('a.dr-note-label')?.getAttribute('href')).toBe('#dr-noteref-n');
    expect(note.querySelector('p')?.textContent).toBe('Note body');
  });

  it('renders images and the placeholder', () => {
    const dom = render([para([pngImage(100, 50, 'pic'), image(70, 40)])]);
    const img = dom.querySelector('img')!;
    expect(img.getAttribute('src')).toBe(`data:image/png;base64,${PNG_BASE64}`);
    expect(img.getAttribute('width')).toBe('100');
    expect(img.getAttribute('alt')).toBe('pic');
    const box = dom.querySelector('span.dr-placeholder')!;
    expect(box.textContent).toBe('Image not shown');
    expect(box.getAttribute('width')).toBe('70');
    expect(box.getAttribute('height')).toBe('40');
  });

  it('renders tables in a scroll wrapper with header, spans and no widths', () => {
    const dom = render([
      table(
        [row(['H1', 'H2'], true), row([cell('a', { colSpan: 2, rowSpan: 2, widthMm: 50, background: '#ff0000' })])],
        [20, 20],
      ),
    ]);
    expect(dom.querySelector('.dr-table-wrap[data-block="0"] > table')).not.toBeNull();
    expect(dom.querySelectorAll('thead th')).toHaveLength(2);
    const td = dom.querySelector('tbody td')!;
    expect(td.getAttribute('colspan')).toBe('2');
    expect(td.getAttribute('rowspan')).toBe('2');
    expect(dom.querySelector('[style]')).toBeNull();
  });

  it('renders a nested table without data-block inside', () => {
    const dom = render([table([row([cell([table([row(['inner'])]), para('after')])])])]);
    expect(dom.querySelector('td .dr-table-wrap td')?.textContent).toBe('inner');
    expect(dom.querySelectorAll('[data-block]')).toHaveLength(1);
  });

  it('keeps markup in text as text', () => {
    const dom = render([para('<img src=x onerror=alert(1)>')]);
    expect(dom.querySelector('img')).toBeNull();
    expect(dom.querySelector('p')?.textContent).toBe('<img src=x onerror=alert(1)>');
  });
});

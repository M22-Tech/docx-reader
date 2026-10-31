import { describe, expect, it } from 'vitest';
import {
  anchor,
  cell,
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
import { renderRaw } from './render-raw';

function render(...args: Parameters<typeof model>) {
  const result = renderRaw(model(...args));
  return { ...result, dom: toDom(result.html) };
}

/** The style attribute as written; jsdom folds margin longhands into the shorthand when read back. */
function declarations(el: Element): Record<string, string> {
  const entries = (el.getAttribute('style') ?? '').split(';').map((d) => d.split(':') as [string, string]);
  return Object.fromEntries(entries);
}

describe('renderRaw sheet', () => {
  it('uses A4 with 2.54 cm margins when the model has no page', () => {
    const { dom, pageWidthPx } = render([para('x')]);
    const sheet = dom.querySelector<HTMLElement>('.dr-sheet')!;
    expect(sheet.style.width).toBe('210mm');
    expect(sheet.style.padding).toBe('25.4mm');
    expect(pageWidthPx).toBe(794);
  });

  it('uses the explicit page', () => {
    const { dom, pageWidthPx } = render([para('x')], {
      page: { widthMm: 148, heightMm: 210, marginTopMm: 10, marginRightMm: 20, marginBottomMm: 30, marginLeftMm: 40 },
    });
    const sheet = dom.querySelector<HTMLElement>('.dr-sheet')!;
    expect(sheet.style.width).toBe('148mm');
    expect(sheet.style.padding).toBe('10mm 20mm 30mm 40mm');
    expect(pageWidthPx).toBe(559);
  });

  it('rounds 210 mm to 794 px', () => {
    const { pageWidthPx } = render([para('x')], {
      page: { widthMm: 210, heightMm: 297, marginTopMm: 1, marginRightMm: 1, marginBottomMm: 1, marginLeftMm: 1 },
    });
    expect(pageWidthPx).toBe(794);
  });

  it('falls back to A4 width for a page that is not a number', () => {
    const { pageWidthPx } = render([para('x')], {
      page: { widthMm: NaN, heightMm: 297, marginTopMm: 1, marginRightMm: 1, marginBottomMm: 1, marginLeftMm: 1 },
    });
    expect(pageWidthPx).toBe(794);
  });
});

describe('renderRaw paragraphs and runs', () => {
  it('turns marks into tags', () => {
    const { dom } = render([
      para([
        run('b', { bold: true }),
        run('i', { italic: true }),
        run('u', { underline: true }),
        run('s', { strike: true }),
        run('p', { superscript: true }),
        run('q', { subscript: true }),
      ]),
    ]);
    for (const [tag, text] of [
      ['strong', 'b'],
      ['em', 'i'],
      ['u', 'u'],
      ['s', 's'],
      ['sup', 'p'],
      ['sub', 'q'],
    ] as const) {
      expect(dom.querySelector(tag)?.textContent).toBe(text);
    }
  });

  it('puts colour, highlight, font and size in a span style', () => {
    const { dom } = render([
      para([run('x', { color: '#ff0000', highlight: '#ffff00', fontFamily: 'Georgia', fontSizePt: 14, bold: true })]),
    ]);
    const span = dom.querySelector<HTMLElement>('p > span')!;
    expect(span.style.color).toBe('rgb(255, 0, 0)');
    expect(span.style.backgroundColor).toBe('rgb(255, 255, 0)');
    expect(span.style.fontFamily).toContain('Georgia');
    expect(span.style.fontSize).toBe('14pt');
    expect(span.querySelector('strong')?.textContent).toBe('x');
  });

  it('merges adjacent runs with equal marks', () => {
    const { dom } = render([para([run('a', { bold: true }), run('b', { bold: true }), run('c')])]);
    const strongs = dom.querySelectorAll('strong');
    expect(strongs).toHaveLength(1);
    expect(strongs[0]?.textContent).toBe('ab');
  });

  it('writes alignment, indents, spacing and line height as inline style', () => {
    const { dom } = render([
      para('x', {
        align: 'justify',
        indentLeftMm: 10,
        indentRightMm: 5,
        firstLineMm: -4,
        spaceBeforePt: 6,
        spaceAfterPt: 12,
        lineHeight: 1.15,
      }),
    ]);
    expect(declarations(dom.querySelector('p')!)).toEqual({
      'text-align': 'justify',
      'margin-left': '10mm',
      'margin-right': '5mm',
      'text-indent': '-4mm',
      'margin-top': '6pt',
      'margin-bottom': '12pt',
      'line-height': '1.15',
    });
  });

  it('writes no style on a plain paragraph', () => {
    const { dom } = render([para('x')]);
    expect(dom.querySelector('p')?.hasAttribute('style')).toBe(false);
  });

  it('renders a heading with class dr-h', () => {
    const { dom } = render([para('Title', { headingLevel: 3 })]);
    const h = dom.querySelector('h3')!;
    expect(h.classList.contains('dr-h')).toBe(true);
    expect(h.textContent).toBe('Title');
  });

  it('renders a list marker, also in a heading', () => {
    const { dom } = render([
      para('Item', { list: { level: 0, marker: '1.', ordered: true } }),
      para('Head', { headingLevel: 2, list: { level: 0, marker: '•', ordered: false } }),
    ]);
    const [first, second] = [dom.querySelector('p')!, dom.querySelector('h2')!];
    expect(first.classList.contains('dr-li')).toBe(true);
    expect(first.firstElementChild?.className).toBe('dr-marker');
    expect(first.firstElementChild?.textContent).toBe('1.');
    expect(second.classList.contains('dr-li')).toBe(true);
    expect(second.classList.contains('dr-h')).toBe(true);
    expect(second.querySelector('.dr-marker')?.textContent).toBe('•');
  });

  it('keeps an empty paragraph tall with a br', () => {
    const { dom } = render([para('')]);
    const p = dom.querySelector('p')!;
    expect(p.children).toHaveLength(1);
    expect(p.firstElementChild?.tagName).toBe('BR');
  });

  it('renders line breaks and tabs', () => {
    const { dom } = render([para([run('a'), { kind: 'lineBreak' }, { kind: 'tab' }, run('b')])]);
    expect(dom.querySelectorAll('p > br')).toHaveLength(1);
    expect(dom.querySelectorAll('p > span.dr-tab')).toHaveLength(1);
  });

  it('marks top-level blocks with data-block, not blocks in cells', () => {
    const { dom } = render([para('a'), { kind: 'pageBreak' }, table([row(['cell'])]), para('b')]);
    const marked = [...dom.querySelectorAll('[data-block]')].map((el) => el.getAttribute('data-block'));
    expect(marked).toEqual(['0', '1', '2', '3']);
    expect(dom.querySelector('td p')?.hasAttribute('data-block')).toBe(false);
  });

  it('renders a page break', () => {
    const { dom } = render([{ kind: 'pageBreak' }]);
    expect(dom.querySelector('hr.dr-page-break')).not.toBeNull();
  });
});

describe('renderRaw tables', () => {
  it('renders header rows, spans, widths and backgrounds', () => {
    const { dom } = render([
      table(
        [
          row(['H1', 'H2'], true),
          row([cell('a', { colSpan: 2, widthMm: 80, background: '#00ff00' })]),
          row([cell('b', { rowSpan: 2 }), 'c']),
          row(['d']),
        ],
        [30, 50],
      ),
    ]);
    expect(dom.querySelector('.dr-table-wrap > table')).not.toBeNull();
    const cols = [...dom.querySelectorAll<HTMLElement>('colgroup > col')].map((c) => c.style.width);
    expect(cols).toEqual(['30mm', '50mm']);
    expect([...dom.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual(['H1', 'H2']);
    const a = dom.querySelector<HTMLElement>('tbody td')!;
    expect(a.getAttribute('colspan')).toBe('2');
    expect(a.style.width).toBe('80mm');
    expect(a.style.backgroundColor).toBe('rgb(0, 255, 0)');
    expect(dom.querySelector('td[rowspan]')?.getAttribute('rowspan')).toBe('2');
  });

  it('renders a nested table', () => {
    const { dom } = render([table([row([cell([table([row(['inner'])])])])])]);
    expect(dom.querySelector('td .dr-table-wrap td')?.textContent).toBe('inner');
  });
});

describe('renderRaw inlines', () => {
  it('renders an image with a data URL and size', () => {
    const { dom } = render([para([pngImage(120, 80, 'alt text')])]);
    const img = dom.querySelector('img')!;
    expect(img.getAttribute('src')).toBe(`data:image/png;base64,${PNG_BASE64}`);
    expect(img.getAttribute('width')).toBe('120');
    expect(img.getAttribute('height')).toBe('80');
    expect(img.getAttribute('alt')).toBe('alt text');
  });

  it('renders a sized placeholder for an image without src', () => {
    const { dom } = render([para([image(120, 80)])]);
    const box = dom.querySelector<HTMLElement>('span.dr-placeholder')!;
    expect(dom.querySelector('img')).toBeNull();
    expect(box.textContent).toBe('Image not shown');
    expect(box.style.width).toBe('120px');
    expect(box.style.height).toBe('80px');
  });

  it('encodes a large image without overflowing the stack', () => {
    const data = new Uint8Array(500_000).fill(65);
    const { dom } = render([para([{ kind: 'image', widthPx: 1, heightPx: 1, src: { mime: 'image/png', data } }])]);
    expect(dom.querySelector('img')?.getAttribute('src')).toHaveLength('data:image/png;base64,'.length + 666_668);
  });

  it('prefixes internal links and anchors with dr-bm-', () => {
    const { dom } = render([para([anchor('chap1'), link('#chap1', run('go')), link('https://e.com/', run('out'))])]);
    expect(dom.querySelector('a.dr-anchor')?.id).toBe('dr-bm-chap1');
    const links = dom.querySelectorAll('a[href]');
    expect(links[0]?.getAttribute('href')).toBe('#dr-bm-chap1');
    expect(links[1]?.getAttribute('href')).toBe('https://e.com/');
  });

  it('gives only the first note reference an id', () => {
    const { dom } = render([para([run('a'), noteRef('n1', '1'), run('b'), noteRef('n1', '1')])], {
      notes: [{ id: 'n1', label: '1', blocks: [para('Note body')] }],
    });
    const refs = dom.querySelectorAll('sup.dr-noteref > a');
    expect(refs).toHaveLength(2);
    expect(refs[0]?.id).toBe('dr-noteref-n1');
    expect(refs[1]?.hasAttribute('id')).toBe(false);
    expect(refs[1]?.getAttribute('href')).toBe('#dr-note-n1');
  });

  it('renders notes after the blocks with back links', () => {
    const { dom } = render([para('Body')], { notes: [{ id: 'n1', label: '1', blocks: [para('Note body')] }] });
    const notes = dom.querySelector('section.dr-notes')!;
    expect(dom.querySelector('.dr-sheet')?.lastElementChild).toBe(notes);
    const note = notes.querySelector('.dr-note')!;
    expect(note.id).toBe('dr-note-n1');
    expect(note.firstElementChild?.getAttribute('href')).toBe('#dr-noteref-n1');
    expect(note.firstElementChild?.className).toBe('dr-note-label');
    expect(note.querySelector('p')?.textContent).toBe('Note body');
  });

  it('renders no notes section without notes', () => {
    expect(render([para('x')]).dom.querySelector('.dr-notes')).toBeNull();
  });
});

describe('renderRaw escaping', () => {
  it('keeps markup in text as text', () => {
    const { dom } = render([para('<script>alert(1)</script> & more')]);
    expect(dom.querySelector('script')).toBeNull();
    expect(dom.querySelector('p')?.textContent).toBe('<script>alert(1)</script> & more');
  });

  it('cleans a font family that tries to end the declaration', () => {
    const { dom } = render([para([run('x', { fontFamily: 'Arial"; background:url(x)' })])]);
    const html = dom.innerHTML;
    expect(html).not.toContain('url(');
    expect(dom.querySelector<HTMLElement>('span')?.style.backgroundImage).toBe('');
    expect(dom.querySelector<HTMLElement>('span')?.style.background).toBe('');
  });

  it('removes backslashes from a font family', () => {
    const { dom } = render([para([run('x', { fontFamily: 'Ar\\ial' })])]);
    expect(dom.querySelector('span')?.getAttribute('style')).toBe("font-family:'Arial'");
  });

  it('drops a font family that is empty after cleaning', () => {
    const { dom } = render([para([run('x', { fontFamily: '";{}' })])]);
    expect(dom.querySelector('span')).toBeNull();
  });

  it('drops colours that are not #rrggbb', () => {
    const { dom } = render([para([run('x', { color: 'red;', highlight: 'url(x)' })])]);
    expect(dom.querySelector('span')).toBeNull();
  });

  it('drops numbers that are not finite', () => {
    const { dom } = render([para('x', { indentLeftMm: Infinity, lineHeight: NaN })]);
    expect(dom.querySelector('p')?.hasAttribute('style')).toBe(false);
  });

  it('keeps quotes in alt text inside the attribute', () => {
    const { dom } = render([para([pngImage(1, 1, 'a "quoted" <b>alt</b>')])]);
    expect(dom.querySelector('img')?.getAttribute('alt')).toBe('a "quoted" <b>alt</b>');
    expect(dom.querySelectorAll('img')).toHaveLength(1);
    expect(dom.querySelector('b')).toBeNull();
  });

  it('keeps a link address with quotes inside its attribute', () => {
    const { dom } = render([para([link('https://e.com/"onmouseover="x', run('l'))])]);
    const a = dom.querySelector('a')!;
    expect(a.getAttribute('href')).toBe('https://e.com/"onmouseover="x');
    expect(a.attributes).toHaveLength(1);
  });
});

import { describe, expect, it } from 'vitest';
import { renderLayout } from '../model/render-layout';
import { renderReading } from '../model/render-reading';
import { fullModel, PNG_BASE64, toDom } from '../model/test-models';
import { sanitizeLayout, sanitizeReading } from './sanitize';

const profiles = [
  ['layout', sanitizeLayout],
  ['reading', sanitizeReading],
] as const;

describe.each(profiles)('%s sanitiser', (name, sanitize) => {
  const layout = name === 'layout';
  const clean = (html: string) => toDom(sanitize(html));
  const PNG = `data:image/png;base64,${PNG_BASE64}`;

  it('removes active content and event handlers', () => {
    const dom = clean(
      '<p onclick="x()">keep</p><script>alert(1)</script><iframe src="https://e.com"></iframe>' +
        '<form action="https://e.com"><input name="a"><button>go</button></form>' +
        '<svg><circle onload="x()"></circle></svg><object data="x"></object><embed src="x"><video src="x"></video>',
    );
    for (const tag of ['script', 'iframe', 'form', 'input', 'button', 'svg', 'object', 'embed', 'video']) {
      expect(dom.querySelector(tag), tag).toBeNull();
    }
    expect(dom.querySelector('p')?.textContent).toBe('keep');
    expect(dom.querySelector('[onclick]')).toBeNull();
    expect(dom.textContent).not.toContain('alert');
  });

  it.each([
    ['https', 'https://e.com/a.png'],
    ['file', 'file:///sdcard/a.png'],
    ['svg data', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='],
    ['relative', 'pictures/a.png'],
    ['missing', ''],
  ])('replaces an image with %s src by a sized placeholder', (_label, src) => {
    const dom = clean(`<p>a<img src="${src}" width="120" height="80">b</p>`);
    expect(dom.querySelector('img')).toBeNull();
    const box = dom.querySelector<HTMLElement>('p > span.dr-placeholder')!;
    expect(box.textContent).toBe('Image not shown');
    expect(box.getAttribute('width')).toBe('120');
    expect(box.getAttribute('height')).toBe('80');
    expect(box.hasAttribute('style')).toBe(layout);
    expect(dom.querySelector('p')?.textContent).toBe('aImage not shownb');
  });

  it('makes a placeholder without size when the image has none', () => {
    const box = clean('<img src="https://e.com/a.png">').querySelector('span.dr-placeholder')!;
    expect(box.hasAttribute('width')).toBe(false);
    expect(box.hasAttribute('style')).toBe(false);
  });

  it('uses the same placeholder markup as the renderers', () => {
    const model = fullModel();
    const rendered = layout ? renderLayout(model).html : renderReading(model);
    const fromModel = toDom(rendered).querySelector('span.dr-placeholder')!;
    const fromSanitiser = clean('<img src="https://e.com/a.png" width="50" height="20">').querySelector(
      'span.dr-placeholder',
    )!;
    expect(fromSanitiser.outerHTML).toBe(fromModel.outerHTML);
  });

  it('keeps png data and blob images', () => {
    const dom = clean(`<img src="${PNG}" width="3" height="2" alt="a"><img src="blob:null/1234" alt="b">`);
    const imgs = dom.querySelectorAll('img');
    expect(imgs).toHaveLength(2);
    expect(imgs[0]?.getAttribute('src')).toBe(PNG);
    expect(imgs[1]?.getAttribute('src')).toBe('blob:null/1234');
    expect(dom.querySelector('.dr-placeholder')).toBeNull();
  });

  it('removes javascript: and relative hrefs but keeps the text', () => {
    const dom = clean(
      '<a href="javascript:alert(1)">one</a><a href="docs/a.html">two</a><a href="file:///a">three</a><a href="data:text/html,x">four</a>',
    );
    const links = dom.querySelectorAll('a');
    expect(links).toHaveLength(4);
    for (const a of links) {
      expect(a.hasAttribute('href')).toBe(false);
      expect(a.hasAttribute('data-external-href')).toBe(false);
    }
    expect(dom.textContent).toBe('onetwothreefour');
  });

  it.each(['http://e.com/a', 'https://e.com/a?b=1', 'mailto:me@e.com'])('moves %s to data-external-href', (href) => {
    const a = clean(`<a href="${href}" target="_blank" ping="https://t.com">text</a>`).querySelector('a')!;
    expect(a.hasAttribute('href')).toBe(false);
    expect(a.getAttribute('data-external-href')).toBe(href);
    expect(a.classList.contains('dr-link')).toBe(true);
    expect(a.getAttribute('role')).toBe('link');
    expect(a.getAttribute('tabindex')).toBe('0');
    expect(a.hasAttribute('target')).toBe(false);
    expect(a.hasAttribute('ping')).toBe(false);
    expect(a.textContent).toBe('text');
  });

  it('keeps hash links', () => {
    const a = clean('<a href="#dr-bm-x">go</a>').querySelector('a')!;
    expect(a.getAttribute('href')).toBe('#dr-bm-x');
    expect(a.hasAttribute('data-external-href')).toBe(false);
  });

  it('ignores a data-external-href written by the document', () => {
    const dom = clean('<span data-external-href="https://e.com" class="dr-link">x</span>');
    expect(dom.querySelector('[data-external-href]')).toBeNull();
  });

  it('removes remote url() values and @import, keeping data: ones', () => {
    const dom = clean(
      '<style>@import url(https://e.com/a.css);@import "b.css"; p{color:red} .a{background:url("https://e.com/x.png")} .b{background:url(data:image/png;base64,AAAA)}</style>' +
        '<p style="background:url(https://e.com/x.png) no-repeat">x</p>',
    );
    if (!layout) {
      expect(dom.querySelector('style')).toBeNull();
      return;
    }
    const css = dom.querySelector('style')!.textContent;
    expect(css).not.toContain('@import');
    expect(css).not.toContain('https://');
    expect(css).toContain('.a{background:none}');
    expect(css).toContain('p{color:red}');
    expect(css).toContain('url(data:image/png;base64,AAAA)');
    expect(dom.querySelector('p')?.getAttribute('style')).toBe('background:none no-repeat');
  });
});

describe('sanitizeLayout', () => {
  const clean = (html: string) => toDom(sanitizeLayout(html));

  it('keeps style attributes, style elements, classes and ids', () => {
    const dom = clean('<style>.a{color:red}</style><p class="a b" id="x" style="color:blue;margin-left:10mm">t</p>');
    expect(dom.querySelector('style')?.textContent).toBe('.a{color:red}');
    const p = dom.querySelector('p')!;
    expect(p.getAttribute('class')).toBe('a b');
    expect(p.id).toBe('x');
    expect(p.getAttribute('style')).toBe('color:blue;margin-left:10mm');
  });

  it('catches escaped spellings of url() and @import', () => {
    const dom = clean(
      '<style>@\\69mport "b.css"; .a{background:\\75 rl(https://e.com/x.png)}</style><p style="background:u\\72l(https://e.com/y.png)">x</p>',
    );
    const css = dom.querySelector('style')!.textContent;
    expect(css).not.toMatch(/import|https/);
    expect(dom.querySelector('p')?.getAttribute('style')).not.toContain('https');
  });

  it('keeps escapes that do not hide anything', () => {
    expect(clean('<style>.a\\:b{color:red}</style>').querySelector('style')?.textContent).toBe('.a\\:b{color:red}');
  });

  it('replaces image-set with a remote image', () => {
    const style = clean('<p style="background:image-set(url(https://e.com/a.png) 1x)">x</p>')
      .querySelector('p')
      ?.getAttribute('style');
    expect(style).toBe('background:none');
  });

  it('keeps table, colgroup and span sizes', () => {
    const dom = clean(
      '<div class="dr-table-wrap"><table><colgroup><col style="width:30mm"></colgroup><tr><td colspan="2" style="background-color:#ff0000">a</td></tr></table></div>',
    );
    expect(dom.querySelector('col')?.getAttribute('style')).toBe('width:30mm');
    expect(dom.querySelector('td')?.getAttribute('colspan')).toBe('2');
  });
});

describe('sanitizeReading', () => {
  const clean = (html: string) => toDom(sanitizeReading(html));

  it('removes style attributes and style elements', () => {
    const dom = clean('<style>p{color:red}</style><p style="color:red">text</p>');
    expect(dom.querySelector('style')).toBeNull();
    expect(dom.querySelector('[style]')).toBeNull();
    expect(dom.textContent).toBe('text');
  });

  it('keeps only dr- classes', () => {
    const dom = clean('<p class="dr-center big">a</p><p class="big">b</p><p class="dr-li x" data-level="2">c</p>');
    const [a, b, c] = dom.querySelectorAll('p');
    expect(a?.getAttribute('class')).toBe('dr-center');
    expect(b?.hasAttribute('class')).toBe(false);
    expect(c?.getAttribute('class')).toBe('dr-li');
  });

  it('removes font and center tags but keeps their text', () => {
    const dom = clean('<center>mid <font color="red" face="Arial">red</font></center><p>x</p>');
    expect(dom.querySelector('font')).toBeNull();
    expect(dom.querySelector('center')).toBeNull();
    expect(dom.textContent).toBe('mid redx');
    expect(dom.querySelector('[color],[face]')).toBeNull();
  });

  it('keeps data-level, colspan, rowspan and ids', () => {
    const dom = clean(
      '<p class="dr-li" data-level="4" id="dr-x">a</p><table><tr><td colspan="2" rowspan="3" bgcolor="red">b</td></tr></table>',
    );
    expect(dom.querySelector('p')?.getAttribute('data-level')).toBe('4');
    expect(dom.querySelector('p')?.id).toBe('dr-x');
    expect(dom.querySelector('td')?.getAttribute('colspan')).toBe('2');
    expect(dom.querySelector('td')?.getAttribute('rowspan')).toBe('3');
    expect(dom.querySelector('td')?.hasAttribute('bgcolor')).toBe(false);
  });

  it('removes tags outside the allow-list and keeps their text', () => {
    const dom = clean('<details><summary>sum</summary>body</details><marquee>m</marquee><p>p</p>');
    expect(dom.querySelector('details,summary,marquee')).toBeNull();
    expect(dom.textContent).toBe('sumbodymp');
  });
});

describe('round trip', () => {
  function links(dom: HTMLElement) {
    return {
      external: [...dom.querySelectorAll('[data-external-href]')].map((a) => a.getAttribute('data-external-href')),
      internal: [...dom.querySelectorAll('a[href^="#"]')].map((a) => a.getAttribute('href')).sort(),
    };
  }

  const expectedInternal = ['#dr-bm-top', '#dr-note-n1', '#dr-noteref-n1'];

  it.each([
    ['layout', () => renderLayout(fullModel()).html, sanitizeLayout],
    ['reading', () => renderReading(fullModel()), sanitizeReading],
  ] as const)('keeps everything the %s renderer wrote', (_name, render, sanitize) => {
    const before = toDom(render());
    const after = toDom(sanitize(render()));
    expect(after.textContent).toBe(before.textContent);
    for (const text of ['Title text', 'bold', 'external link', 'internal link', 'Footnote text', 'Head A', 'Cell A']) {
      expect(after.textContent).toContain(text);
    }
    const img = after.querySelector('img')!;
    expect(img.getAttribute('src')).toBe(`data:image/png;base64,${PNG_BASE64}`);
    expect(img.getAttribute('alt')).toBe('a picture');
    expect(after.querySelectorAll('img')).toHaveLength(1);
    expect(after.querySelectorAll('.dr-placeholder')).toHaveLength(1);
    expect(links(after)).toEqual({
      external: ['https://example.com/a'],
      internal: expectedInternal,
    });
    expect(after.querySelector('a.dr-anchor')?.id).toBe('dr-bm-top');
    expect(after.querySelector('sup.dr-noteref > a')?.id).toBe('dr-noteref-n1');
    expect(after.querySelector('.dr-note-label')?.getAttribute('href')).toBe('#dr-noteref-n1');
    expect(after.querySelectorAll('hr.dr-page-break')).toHaveLength(1);
    expect(after.querySelector('td[colspan="2"]')).not.toBeNull();
    expect(after.querySelector('thead th')).not.toBeNull();
    expect([...after.querySelectorAll('[data-block]')].map((e) => e.getAttribute('data-block'))).toEqual(
      [...before.querySelectorAll('[data-block]')].map((e) => e.getAttribute('data-block')),
    );
  });
});

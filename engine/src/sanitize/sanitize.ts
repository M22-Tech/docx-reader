import createDOMPurify, { type Config } from 'dompurify';
import { placeholderHtml, safeNumber } from '../model/html';

type Profile = 'raw' | 'rendered';

const FORBIDDEN_TAGS = [
  'script',
  'iframe',
  'frame',
  'object',
  'embed',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'link',
  'meta',
  'base',
  'audio',
  'video',
  'source',
  'template',
];
const FORBIDDEN_ATTRS = ['target', 'ping', 'srcset', 'background', 'poster'];
const RENDERED_TAGS = [
  ...['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 'u', 's', 'sup', 'sub', 'br', 'hr'],
  ...['a', 'img', 'span', 'div', 'section', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption'],
  ...['ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'figure', 'figcaption'],
];
const RENDERED_ATTRS = [
  'id',
  'class',
  'colspan',
  'rowspan',
  'width',
  'height',
  'alt',
  'href',
  'src',
  'role',
  'tabindex',
];

// DOMPurify's default plus blob:, which it would otherwise drop from image sources.
const ALLOWED_URI = /^(?:(?:https?|mailto|blob):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i;
const IMAGE_SRC = /^\s*(?:data:image\/(?:png|jpeg|gif|bmp|webp);base64,|blob:)/i;
const EXTERNAL_HREF = /^\s*(?:https?|mailto):/i;
const CSS_URL = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi;
const CSS_IMAGE_FUNCTION = /(?<![\w-])(?:-webkit-)?(?:image-set|cross-fade|image|src)\([^)]*\)/gi;
const CSS_IMPORT = /@import\b[^;]*;?/gi;
const CSS_ESCAPE = /\\(?:([0-9a-f]{1,6})[ \t\n\r\f]?|(\r\n|[\n\r\f])|(.))/gi;

function createConfig(profile: Profile): Config {
  const base: Config = { FORBID_TAGS: FORBIDDEN_TAGS, FORBID_ATTR: FORBIDDEN_ATTRS, ALLOWED_URI_REGEXP: ALLOWED_URI };
  if (profile === 'raw') return { ...base, USE_PROFILES: { html: true }, FORCE_BODY: true };
  return { ...base, ALLOWED_TAGS: RENDERED_TAGS, ALLOWED_ATTR: RENDERED_ATTRS, ALLOW_DATA_ATTR: true };
}

function unescapeCss(css: string): string {
  return css.replace(CSS_ESCAPE, (_m, hex?: string, newline?: string, char?: string) => {
    if (newline) return '';
    if (char) return char;
    const code = parseInt(hex ?? '', 16);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '�';
  });
}

function stripCss(css: string): string {
  return css
    .replace(CSS_IMPORT, '')
    .replace(CSS_URL, (match, dq?: string, sq?: string, bare?: string) =>
      /^(?:data|blob):/i.test((dq ?? sq ?? bare ?? '').trim()) ? match : 'none',
    )
    .replace(CSS_IMAGE_FUNCTION, 'none');
}

/** Replaces `url()` that isn't `data:` or `blob:` with `none` and removes `@import`; escaped spellings are caught too. */
function cleanCss(css: string): string {
  const direct = stripCss(css);
  if (!css.includes('\\')) return direct;
  const decoded = unescapeCss(css);
  const cleaned = stripCss(decoded);
  return cleaned === decoded ? direct : cleaned;
}

function imageSize(value: string | null): number | undefined {
  const n = safeNumber(value === null ? undefined : parseFloat(value));
  return n !== undefined && n > 0 ? n : undefined;
}

function replaceWithPlaceholder(img: Element, withStyle: boolean): void {
  const template = img.ownerDocument.createElement('template');
  template.innerHTML = placeholderHtml(
    imageSize(img.getAttribute('width')),
    imageSize(img.getAttribute('height')),
    withStyle,
  );
  img.replaceWith(template.content);
}

function createPurifier(profile: Profile) {
  const isRaw = profile === 'raw';
  const purify = createDOMPurify(window);
  purify.setConfig(createConfig(profile));

  purify.addHook('uponSanitizeElement', (node, data) => {
    if (data.tagName === 'img') {
      const img = node as Element;
      if (!IMAGE_SRC.test(img.getAttribute('src') ?? '')) replaceWithPlaceholder(img, isRaw);
    } else if (isRaw && data.tagName === 'style') {
      node.textContent = cleanCss(node.textContent ?? '');
    }
  });

  purify.addHook('uponSanitizeAttribute', (_node, data) => {
    if (data.attrName === 'data-external-href') {
      // Only the sanitiser sets this one, below.
      data.keepAttr = false;
    } else if (isRaw && data.attrName === 'style') {
      data.attrValue = cleanCss(data.attrValue);
    } else if (!isRaw && data.attrName === 'class') {
      data.attrValue = data.attrValue
        .split(/\s+/)
        .filter((name) => name.startsWith('dr-'))
        .join(' ');
      if (data.attrValue === '') data.keepAttr = false;
    }
  });

  purify.addHook('afterSanitizeAttributes', (node) => {
    const href = node.getAttribute('href');
    if (href === null || href.startsWith('#')) return;
    if (EXTERNAL_HREF.test(href)) {
      node.setAttribute('data-external-href', href.trim());
      node.classList.add('dr-link');
      node.setAttribute('role', 'link');
      node.setAttribute('tabindex', '0');
    }
    node.removeAttribute('href');
  });

  return purify;
}

const rawPurify = createPurifier('raw');
const renderedPurify = createPurifier('rendered');

/** Cleans HTML for Raw mode: keeps `class`, `id`, `style` and `<style>`, with remote `url()` removed. */
export function sanitizeRaw(html: string): string {
  return rawPurify.sanitize(html);
}

/** Cleans HTML for Rendered mode: an allow-list of tags, no styles, only `dr-` classes. */
export function sanitizeRendered(html: string): string {
  return renderedPurify.sanitize(html);
}

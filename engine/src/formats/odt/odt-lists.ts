import { parseLength } from '../shared/units';
import { attr, childElements, intAttr, NS, round } from './odt-xml';

/** One level of a list style. */
export interface ListLevel {
  kind: 'number' | 'bullet';
  /** `style:num-format`: "1", "a", "A", "i", "I", or "" for no number. */
  format: string;
  letterSync: boolean;
  prefix: string;
  suffix: string;
  displayLevels: number;
  startValue: number;
  bulletChar: string;
  marginLeftMm: number | undefined;
  textIndentMm: number | undefined;
}

/** The levels of a list style, by level number (1-based). */
export type ListStyle = ReadonlyMap<number, ListLevel>;

/** What a list paragraph shows: the marker text, and the indents of its level. */
export interface ListMarker {
  level: number;
  /** Empty for a list header and for the paragraphs of an item after its first. */
  marker: string;
  ordered: boolean;
  marginLeftMm: number | undefined;
  textIndentMm: number | undefined;
}

/** A list being walked: the counters (shared by lists that continue each other) and the list's style. */
export interface ListHandle {
  counters: number[];
  style: ListStyle | undefined;
}

const DEFAULT_BULLET = '•';
const MAX_LEVELS = 10;

const DEFAULT_LEVEL: ListLevel = {
  kind: 'bullet',
  format: '',
  letterSync: false,
  prefix: '',
  suffix: '',
  displayLevels: 1,
  startValue: 1,
  bulletChar: DEFAULT_BULLET,
  marginLeftMm: undefined,
  textIndentMm: undefined,
};

/** Bullets are often private-use characters of a symbol font, which the page can't show. */
function cleanBullet(char: string | undefined): string {
  if (!char) return DEFAULT_BULLET;
  const code = char.codePointAt(0) ?? 0;
  return code >= 0xe000 && code <= 0xf8ff ? DEFAULT_BULLET : char;
}

function mm(element: Element | undefined, name: string): number | undefined {
  const length = parseLength(element ? attr(element, NS.fo, name) : undefined);
  return length ? round(length.mm, 3) : undefined;
}

function readLevel(element: Element): ListLevel {
  const bullet = element.localName !== 'list-level-style-number';
  const alignment = childElements(element)
    .filter((child) => child.localName === 'list-level-properties')
    .flatMap((props) => childElements(props))
    .find((child) => child.localName === 'list-level-label-alignment');
  return {
    kind: bullet ? 'bullet' : 'number',
    format: attr(element, NS.style, 'num-format') ?? '',
    letterSync: attr(element, NS.style, 'num-letter-sync') === 'true',
    prefix: attr(element, NS.style, 'num-prefix') ?? '',
    suffix: attr(element, NS.style, 'num-suffix') ?? '',
    displayLevels: intAttr(element, NS.text, 'display-levels', 1),
    startValue: intAttr(element, NS.text, 'start-value', 1, 0),
    bulletChar: cleanBullet(attr(element, NS.text, 'bullet-char')),
    marginLeftMm: mm(alignment, 'margin-left'),
    textIndentMm: mm(alignment, 'text-indent'),
  };
}

/** The list styles of both files by name; automatic styles of content.xml win. */
export function readListStyles(content: Document, styles: Document | undefined): Map<string, ListStyle> {
  const result = new Map<string, ListStyle>();
  for (const doc of [styles, content]) {
    if (!doc) continue;
    for (const section of childElements(doc.documentElement)) {
      if (section.namespaceURI !== NS.office) continue;
      for (const element of childElements(section)) {
        if (element.namespaceURI !== NS.text || element.localName !== 'list-style') continue;
        const name = attr(element, NS.style, 'name');
        if (name === undefined) continue;
        const levels = new Map<number, ListLevel>();
        for (const levelElement of childElements(element)) {
          if (levelElement.namespaceURI !== NS.text || !levelElement.localName.startsWith('list-level-style-'))
            continue;
          const level = intAttr(levelElement, NS.text, 'level', 0, 0);
          if (level >= 1 && level <= MAX_LEVELS) levels.set(level, readLevel(levelElement));
        }
        result.set(name, levels);
      }
    }
  }
  return result;
}

/** The level's definition; a level the style doesn't define uses its deepest defined level. */
function levelOf(style: ListStyle | undefined, level: number): ListLevel {
  if (!style || style.size === 0) return DEFAULT_LEVEL;
  const exact = style.get(level);
  if (exact) return exact;
  for (let candidate = Math.min(level, MAX_LEVELS); candidate >= 1; candidate--) {
    const found = style.get(candidate);
    if (found) return found;
  }
  return DEFAULT_LEVEL;
}

const ROMAN: [number, string][] = [
  [1000, 'm'],
  [900, 'cm'],
  [500, 'd'],
  [400, 'cd'],
  [100, 'c'],
  [90, 'xc'],
  [50, 'l'],
  [40, 'xl'],
  [10, 'x'],
  [9, 'ix'],
  [5, 'v'],
  [4, 'iv'],
  [1, 'i'],
];

/** A counter value written in a `style:num-format`. */
export function formatNumber(value: number, format: string, letterSync: boolean): string {
  switch (format) {
    case 'a':
    case 'A': {
      if (value < 1) return String(value);
      // "a" runs a to z, then aa, ab…; with letter-sync it runs a to z, then aa, bb…
      const index = value - 1;
      const text = letterSync
        ? String.fromCharCode(97 + (index % 26)).repeat(Math.floor(index / 26) + 1)
        : letters(index);
      return format === 'A' ? text.toUpperCase() : text;
    }
    case 'i':
    case 'I': {
      if (value < 1 || value > 3999) return String(value);
      let rest = value;
      let text = '';
      for (const [amount, symbol] of ROMAN) {
        while (rest >= amount) {
          text += symbol;
          rest -= amount;
        }
      }
      return format === 'I' ? text.toUpperCase() : text;
    }
    default:
      return String(value);
  }
}

function letters(zeroBased: number): string {
  let text = '';
  let rest = zeroBased;
  do {
    text = String.fromCharCode(97 + (rest % 26)) + text;
    rest = Math.floor(rest / 26) - 1;
  } while (rest >= 0);
  return text;
}

/** Keeps the counters of every list in a document, so the markers come out as the file's application showed them. */
export class ListNumbering {
  private readonly byId = new Map<string, ListHandle>();
  private readonly lastByStyle = new Map<string, ListHandle>();

  constructor(private readonly styles: ReadonlyMap<string, ListStyle>) {}

  /** Starts an outermost `text:list`. */
  begin(list: {
    styleName: string | undefined;
    xmlId: string | undefined;
    continueList: string | undefined;
    continueNumbering: boolean;
  }): ListHandle {
    const style = list.styleName === undefined ? undefined : this.styles.get(list.styleName);
    const continued =
      (list.continueList === undefined ? undefined : this.byId.get(list.continueList)) ??
      (list.continueNumbering && list.styleName !== undefined ? this.lastByStyle.get(list.styleName) : undefined);
    const handle: ListHandle = { counters: continued ? continued.counters : [], style: style ?? continued?.style };
    if (list.xmlId !== undefined) this.byId.set(list.xmlId, handle);
    if (list.styleName !== undefined) this.lastByStyle.set(list.styleName, handle);
    return handle;
  }

  /** The first paragraph of a list item (`level` is 0 for the outermost list). */
  item(handle: ListHandle, level: number, startValue: number | undefined): ListMarker {
    const definition = levelOf(handle.style, level + 1);
    const { counters } = handle;
    const current = counters[level];
    counters[level] = startValue ?? (current === undefined ? definition.startValue : current + 1);
    // A new item restarts the levels below it.
    counters.length = level + 1;

    if (definition.kind === 'bullet') {
      return this.listMarker(level, definition.bulletChar, false, definition);
    }
    if (definition.format === '') {
      return this.listMarker(level, definition.prefix + definition.suffix, false, definition);
    }
    const shown: string[] = [];
    for (let at = Math.max(0, level - definition.displayLevels + 1); at <= level; at++) {
      const own = levelOf(handle.style, at + 1);
      shown.push(formatNumber(counters[at] ?? own.startValue, own.format === '' ? '1' : own.format, own.letterSync));
    }
    return this.listMarker(level, definition.prefix + shown.join('.') + definition.suffix, true, definition);
  }

  /** A paragraph in a list that has no marker: a list header, or a later paragraph of an item. */
  unmarked(handle: ListHandle, level: number): ListMarker {
    const definition = levelOf(handle.style, level + 1);
    return this.listMarker(level, '', definition.kind === 'number' && definition.format !== '', definition);
  }

  private listMarker(level: number, marker: string, ordered: boolean, definition: ListLevel): ListMarker {
    return {
      level,
      marker,
      ordered,
      marginLeftMm: definition.marginLeftMm,
      textIndentMm: definition.textIndentMm,
    };
  }
}

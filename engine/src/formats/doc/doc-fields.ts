const FIELD_BEGIN = '\x13';
const FIELD_SEPARATOR = '\x14';
const FIELD_END = '\x15';

/** A run of shown characters; `href` is set inside a HYPERLINK field's result. */
export interface FieldChunk {
  text: string;
  href?: string;
}

interface Frame {
  inResult: boolean;
  instruction: string;
  href?: string;
}

function innermost(stack: Frame[], test: (frame: Frame) => boolean): Frame | undefined {
  for (let i = stack.length - 1; i >= 0; i--) if (test(stack[i] as Frame)) return stack[i];
  return undefined;
}

/**
 * Resolves the fields in a run of characters (nested `0x13` instruction `0x14` result `0x15`) to the text that is shown:
 * only results, with the link of the nearest enclosing HYPERLINK. A field without a separator shows nothing.
 * Unbalanced markers are dropped. Other control characters pass through for the caller to read.
 */
export function resolveFields(text: string): FieldChunk[] {
  const chunks: FieldChunk[] = [];
  const stack: Frame[] = [];

  for (const char of text) {
    if (char === FIELD_BEGIN) {
      stack.push({ inResult: false, instruction: '' });
    } else if (char === FIELD_SEPARATOR) {
      const top = stack[stack.length - 1];
      if (top && !top.inResult) {
        top.inResult = true;
        const href = hyperlinkTarget(top.instruction);
        if (href !== undefined) top.href = href;
      }
    } else if (char === FIELD_END) {
      stack.pop();
    } else {
      const instructionFrame = innermost(stack, (frame) => !frame.inResult);
      if (instructionFrame) {
        instructionFrame.instruction += char;
      } else {
        const href = innermost(stack, (frame) => frame.href !== undefined)?.href;
        const last = chunks[chunks.length - 1];
        if (last && last.href === href) last.text += char;
        else chunks.push(href === undefined ? { text: char } : { text: char, href });
      }
    }
  }
  return chunks;
}

const HYPERLINK = /^\s*HYPERLINK\b/i;
// Switches that take an argument: \l bookmark, \o tooltip, \t frame.
const SWITCHES_WITH_ARGUMENT = new Set(['\\l', '\\o', '\\t']);

/** The link target of a HYPERLINK instruction, "#bookmark" for `\l`; undefined for any other field or no target. */
function hyperlinkTarget(instruction: string): string | undefined {
  // eslint-disable-next-line no-control-regex
  const clean = instruction.replace(/[\x00-\x1f]/g, ' ');
  if (!HYPERLINK.test(clean)) return undefined;
  const tokens = tokenize(clean.replace(HYPERLINK, ''));
  let url = '';
  let bookmark = '';
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] as string;
    const switchName = token.toLowerCase();
    if (!token.startsWith('\\') || token.length < 2) {
      if (!url) url = token;
    } else if (SWITCHES_WITH_ARGUMENT.has(switchName)) {
      const argument = tokens[++i] ?? '';
      if (switchName === '\\l') bookmark = argument;
    }
  }
  if (url && bookmark) return `${url}#${bookmark}`;
  if (url) return url;
  return bookmark ? `#${bookmark}` : undefined;
}

/** Splits an instruction into words and quoted strings; inside quotes `\\` and `\"` are escapes. */
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < text.length) {
    const char = text[i] as string;
    if (/\s/.test(char)) {
      i++;
    } else if (char === '"') {
      let value = '';
      i++;
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\' && (text[i + 1] === '\\' || text[i + 1] === '"')) i++;
        value += text[i];
        i++;
      }
      i++;
      tokens.push(value);
    } else {
      let value = '';
      while (i < text.length && !/\s/.test(text[i] as string)) value += text[i++];
      tokens.push(value);
    }
  }
  return tokens;
}

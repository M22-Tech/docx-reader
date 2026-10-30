import type { Block, Inline, Link, Paragraph } from '../../model/document-model';
import { resolveFields } from './doc-fields';

const NON_BREAKING_HYPHEN = '‑';

/** Builds paragraphs and page breaks from a run of document text. No formatting yet. */
export function buildBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let inlines: Inline[] = [];
  let link: Link | undefined;

  function add(inline: Inline, href: string | undefined): void {
    if (href === undefined) {
      link = undefined;
      inlines.push(inline);
      return;
    }
    if (link?.href !== href) {
      link = { kind: 'link', href, inlines: [] };
      inlines.push(link);
    }
    link.inlines.push(inline);
  }

  function addText(chars: string, href: string | undefined): void {
    const target = href === undefined ? inlines : link?.href === href ? link.inlines : undefined;
    const last = target?.[target.length - 1];
    if (last?.kind === 'text' && !last.marks) last.text += chars;
    else add({ kind: 'text', text: chars }, href);
  }

  function endParagraph(): Paragraph {
    const paragraph: Paragraph = { kind: 'paragraph', inlines };
    blocks.push(paragraph);
    inlines = [];
    link = undefined;
    return paragraph;
  }

  for (const chunk of resolveFields(text)) {
    let run = '';
    const flush = () => {
      if (run) addText(run, chunk.href);
      run = '';
    };
    for (const char of chunk.text) {
      switch (char) {
        case '\r':
          flush();
          endParagraph();
          break;
        case '\x07':
          // A cell end, or a row end whose paragraph is empty; cells are plain paragraphs until tables are read.
          flush();
          if (inlines.length > 0) endParagraph();
          break;
        case '\x0b':
          flush();
          add({ kind: 'lineBreak' }, chunk.href);
          break;
        case '\t':
          flush();
          add({ kind: 'tab' }, chunk.href);
          break;
        case '\x0c':
          flush();
          if (inlines.length > 0) endParagraph();
          blocks.push({ kind: 'pageBreak' });
          break;
        case '\x1e':
          run += NON_BREAKING_HYPHEN;
          break;
        default:
          // Other control characters (pictures, drawings, comment marks, optional hyphens) are dropped for now.
          if (char >= ' ') run += char;
      }
    }
    flush();
  }
  if (inlines.length > 0) endParagraph();
  return blocks;
}

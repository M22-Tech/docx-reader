import type { CharProps, ParaProps } from './rtf-properties';

export interface Style {
  kind: 'paragraph' | 'character';
  index: number;
  name: string;
  basedOn?: number;
  char: CharProps;
  para: ParaProps;
}

/** A style with its `\sbasedon` chain folded in. */
export interface ResolvedStyle {
  char: CharProps;
  para: ParaProps;
  /** The style's name, then the names of the styles it is based on. */
  names: string[];
}

const MAX_CHAIN = 32;
const EMPTY: ResolvedStyle = { char: {}, para: {}, names: [] };

/** The `\stylesheet` entries by kind and index. */
export class StyleSheet {
  private readonly styles = new Map<string, Style>();
  private readonly resolved = new Map<string, ResolvedStyle>();

  add(style: Style): void {
    this.styles.set(`${style.kind}:${style.index}`, style);
    this.resolved.clear();
  }

  paragraph(index: number): ResolvedStyle {
    return this.resolve('paragraph', index);
  }

  character(index: number): ResolvedStyle {
    return this.resolve('character', index);
  }

  private resolve(kind: Style['kind'], index: number): ResolvedStyle {
    const key = `${kind}:${index}`;
    const known = this.resolved.get(key);
    if (known) return known;
    const chain: Style[] = [];
    const seen = new Set<number>();
    for (let next: number | undefined = index; next !== undefined && !seen.has(next);) {
      seen.add(next);
      const style = this.styles.get(`${kind}:${next}`);
      if (!style || chain.length >= MAX_CHAIN) break;
      chain.push(style);
      next = style.basedOn;
    }
    if (chain.length === 0) return EMPTY;
    const result: ResolvedStyle = { char: {}, para: {}, names: chain.map((style) => style.name) };
    // Base first, so the derived style's values win.
    for (const style of chain.reverse()) {
      Object.assign(result.char, style.char);
      Object.assign(result.para, style.para);
    }
    this.resolved.set(key, result);
    return result;
  }
}

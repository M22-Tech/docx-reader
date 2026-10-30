import { DocumentError } from '../../document-error';
import type { FcLcbPair } from './doc-fib';
import { DocReader } from './doc-reader';

const NO_BASE = 0x0fff;
const MIN_STD_BASE = 10;
const STI_TITLE = 62;
const KINDS = { 1: 'paragraph', 2: 'character', 3: 'table', 4: 'list' } as const;

export type StyleKind = (typeof KINDS)[keyof typeof KINDS] | 'other';

/** One style of the style sheet. */
export interface StyleDef {
  istd: number;
  /** The built-in style identifier (1 to 9 are Heading 1 to 9). */
  sti: number;
  kind: StyleKind;
  /** The style this one is based on, or undefined for a root. */
  istdBase?: number;
  name: string;
  /** The paragraph properties of a paragraph style. */
  paraGrpprl: Uint8Array;
  /** The character properties of a paragraph or character style. */
  charGrpprl: Uint8Array;
}

export interface StyleSheet {
  /** `cbSTDBaseInFile` from the `STSHI`. */
  cbStdBaseInFile: number;
  /** One entry per style index; undefined for an empty slot. */
  styles: readonly (StyleDef | undefined)[];
  /** The style and the styles it is based on, root first. A loop in the chain is cut where it closes. */
  chain(istd: number | undefined): StyleDef[];
}

const empty: Uint8Array = new Uint8Array(0);

/** Builds a style sheet over a list of styles. */
export function createStyleSheet(
  styles: readonly (StyleDef | undefined)[],
  cbStdBaseInFile = MIN_STD_BASE,
): StyleSheet {
  return {
    cbStdBaseInFile,
    styles,
    chain(istd) {
      const found: StyleDef[] = [];
      const seen = new Set<number>();
      let next = istd;
      while (next !== undefined && !seen.has(next)) {
        seen.add(next);
        const style = styles[next];
        if (!style) break;
        found.push(style);
        next = style.istdBase;
      }
      return found.reverse();
    },
  };
}

/** The name Word gives a built-in style that is stored without one. */
function builtInName(sti: number): string {
  if (sti === 0) return 'Normal';
  if (sti >= 1 && sti <= 9) return `Heading ${sti}`;
  return sti === STI_TITLE ? 'Title' : '';
}

function readStyle(std: DocReader, istd: number, cbStdBaseInFile: number): StyleDef {
  const sti = std.u16(0) & 0x0fff;
  const w1 = std.u16(2);
  const stk = w1 & 0x0f;
  const base = w1 >> 4;
  const cupx = std.u16(4) & 0x0f;
  const kind: StyleKind = KINDS[stk as keyof typeof KINDS] ?? 'other';

  const cch = std.u16(cbStdBaseInFile);
  const name = std.utf16(cbStdBaseInFile + 2, cch);
  let at = cbStdBaseInFile + 2 + cch * 2 + 2;

  const upxs: Uint8Array[] = [];
  for (let i = 0; i < cupx && at + 2 <= std.length; i++) {
    const cb = std.u16(at);
    upxs.push(std.bytes(at + 2, cb));
    at += 2 + cb + (cb % 2);
  }
  // A paragraph style has a paragraph UPX (its `istd`, then the grpprl) and a character UPX; a character style only the latter.
  let paraGrpprl = empty;
  let charGrpprl = empty;
  const paragraphUpx = (upx: Uint8Array | undefined) => (upx && upx.length >= 2 ? upx.subarray(2) : empty);
  if (kind === 'paragraph') {
    paraGrpprl = paragraphUpx(upxs[0]);
    charGrpprl = upxs[1] ?? empty;
  } else if (kind === 'character') {
    charGrpprl = upxs[0] ?? empty;
  }

  return {
    istd,
    sti,
    kind,
    ...(base === NO_BASE || base === istd ? {} : { istdBase: base }),
    name: name || builtInName(sti),
    paraGrpprl,
    charGrpprl,
  };
}

/** Reads the `STSH`: the `STSHI` (`cstd`, `cbSTDBaseInFile`), then one `LPStd` per style. A damaged style is left empty. */
export function readStyleSheet(table: Uint8Array, pair: FcLcbPair): StyleSheet {
  const reader = new DocReader(table);
  const cbStshi = reader.u16(pair.fc);
  if (cbStshi < 4) throw new DocumentError('corrupt', 'The STSHI is too short.');
  const cstd = reader.u16(pair.fc + 2);
  const cbStdBaseInFile = reader.u16(pair.fc + 4);
  if (cbStdBaseInFile < MIN_STD_BASE) throw new DocumentError('corrupt', 'The STSHI has a bad cbSTDBaseInFile.');
  const end = pair.fc + pair.lcb;
  let at = pair.fc + 2 + cbStshi;

  const styles: (StyleDef | undefined)[] = [];
  for (let istd = 0; istd < cstd; istd++) {
    if (at + 2 > end) throw new DocumentError('corrupt', 'The STSH ends before its last style.');
    const cbStd = reader.u16(at);
    at += 2;
    if (at + cbStd > end) throw new DocumentError('corrupt', 'A style lies outside the STSH.');
    let style: StyleDef | undefined;
    if (cbStd > 0) {
      try {
        style = readStyle(new DocReader(reader.bytes(at, cbStd)), istd, cbStdBaseInFile);
      } catch (error) {
        if (!(error instanceof DocumentError)) throw error;
      }
    }
    styles.push(style);
    at += cbStd;
  }
  return createStyleSheet(styles, cbStdBaseInFile);
}

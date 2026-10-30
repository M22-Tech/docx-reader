import { DocumentError } from '../../document-error';
import { bulletFor } from '../shared/bullets';
import type { FcLcbPair } from './doc-fib';
import { DocReader } from './doc-reader';
import { i16, readSprms, Sprm } from './doc-sprm';

const LSTF_SIZE = 28;
const LVLF_SIZE = 28;
const LFO_SIZE = 16;
const LEVELS = 9;

/** `nfc` values the parser knows; any other falls back to decimal. */
const Nfc = {
  Decimal: 0,
  UpperRoman: 1,
  LowerRoman: 2,
  UpperLetter: 3,
  LowerLetter: 4,
  ZeroDecimal: 22,
  Bullet: 23,
  None: 255,
};

const ROMAN: readonly [number, string][] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

/** One level of a list: an `LVL`. */
export interface ListLevel {
  startAt: number;
  nfc: number;
  /** `ilvlRestartLim`; 0 when not set. */
  restartLimit: number;
  /** The marker template: characters 0 to 8 stand for the current number of that level. */
  xst: string;
  /** The level's `grpprlPapx`, which gives the indents of its paragraphs. */
  papx: Uint8Array;
  /** `sprmPDxaLeft` and `sprmPDxaLeft1` of `papx`, in twips, when it sets them. */
  indentLeft?: number;
  indentFirst?: number;
}

/** An `LSTF` with its levels (one for a simple list, else nine). */
export interface ListDef {
  lsid: number;
  levels: ListLevel[];
}

/** What an `LFOLVL` changes in a list level. */
export interface LevelOverride {
  startAt?: number;
  /** Set when the `LFOLVL` carries a whole `LVL`. */
  level?: ListLevel;
}

/** An `LFO`: the list a paragraph's `ilfo` selects, with its level overrides by level. */
export interface ListOverride {
  lsid: number;
  overrides: Map<number, LevelOverride>;
}

export interface ListTables {
  lists: ListDef[];
  lfos: ListOverride[];
}

/** A `LVL` at byte `at` of the table stream, and the byte after it. */
function readLevel(table: DocReader, at: number): { level: ListLevel; end: number } {
  const cbChpx = table.u8(at + 24);
  const cbPapx = table.u8(at + 25);
  const papxAt = at + LVLF_SIZE;
  const papx = table.bytes(papxAt, cbPapx);
  const xstAt = papxAt + cbPapx + cbChpx;
  const cch = table.u16(xstAt);
  const level: ListLevel = {
    startAt: table.i32(at),
    nfc: table.u8(at + 4),
    restartLimit: table.u8(at + 26),
    xst: table.utf16(xstAt + 2, cch),
    papx,
  };
  for (const { sprm, operand } of readSprms(papx)) {
    if (sprm === Sprm.PDxaLeft || (sprm === Sprm.PDxaLeft80 && level.indentLeft === undefined)) {
      level.indentLeft = i16(operand);
    } else if (sprm === Sprm.PDxaLeft1 || (sprm === Sprm.PDxaLeft180 && level.indentFirst === undefined)) {
      level.indentFirst = i16(operand);
    }
  }
  return { level, end: xstAt + 2 + cch * 2 };
}

/** The `LSTF`s of `PlfLst` and the `LVL`s that follow them. A list the stream cuts short, and those after it, are left out. */
function readLists(table: DocReader, pair: FcLcbPair): ListDef[] {
  const lists: ListDef[] = [];
  const count = table.u16(pair.fc);
  let levelsAt = pair.fc + 2 + count * LSTF_SIZE;
  try {
    for (let i = 0; i < count; i++) {
      const lstf = pair.fc + 2 + i * LSTF_SIZE;
      const simple = (table.u8(lstf + 26) & 1) !== 0;
      const levels: ListLevel[] = [];
      for (let j = 0; j < (simple ? 1 : LEVELS); j++) {
        const read = readLevel(table, levelsAt);
        levels.push(read.level);
        levelsAt = read.end;
      }
      lists.push({ lsid: table.u32(lstf), levels });
    }
  } catch (error) {
    if (!(error instanceof DocumentError)) throw error;
  }
  return lists;
}

/** The `LFO`s of `PlfLfo` and the `LFOLVL`s of their `LFOData`. An `LFO` the stream cuts short, and those after it, are left out. */
function readOverrides(table: DocReader, pair: FcLcbPair): ListOverride[] {
  const lfos: ListOverride[] = [];
  const count = table.u32(pair.fc);
  const lfoAt = pair.fc + 4;
  try {
    let dataAt = lfoAt + count * LFO_SIZE;
    table.bytes(lfoAt, count * LFO_SIZE);
    for (let i = 0; i < count; i++) {
      const clfolvl = table.u8(lfoAt + i * LFO_SIZE + 12);
      const overrides = new Map<number, LevelOverride>();
      // The `LFOData` starts with a 4-byte `cp`.
      dataAt += 4;
      for (let j = 0; j < clfolvl; j++) {
        const startAt = table.i32(dataAt);
        const flags = table.u32(dataAt + 4);
        dataAt += 8;
        const override: LevelOverride = {};
        if (flags & 0x10) override.startAt = startAt;
        if (flags & 0x20) {
          const read = readLevel(table, dataAt);
          override.level = read.level;
          dataAt = read.end;
        }
        overrides.set(flags & 0x0f, override);
      }
      lfos.push({ lsid: table.u32(lfoAt + i * LFO_SIZE), overrides });
    }
  } catch (error) {
    if (!(error instanceof DocumentError)) throw error;
  }
  return lfos;
}

/** Reads `PlfLst` and `PlfLfo` from the table stream; a structure that is absent gives no lists. */
export function readListTables(
  tableStream: Uint8Array,
  plfLst: FcLcbPair | undefined,
  plfLfo: FcLcbPair | undefined,
): ListTables {
  const table = new DocReader(tableStream);
  return {
    lists: plfLst ? readLists(table, plfLst) : [],
    lfos: plfLfo ? readOverrides(table, plfLfo) : [],
  };
}

/** The list and `LFO` a paragraph's `ilfo` (1-based) names, or undefined. */
function listFor(tables: ListTables, ilfo: number): { list: ListDef; lfo: ListOverride } | undefined {
  const lfo = tables.lfos[ilfo - 1];
  const list = lfo && tables.lists.find((candidate) => candidate.lsid === lfo.lsid);
  return list && lfo ? { list, lfo } : undefined;
}

/** A level as an `LFO` sees it: its own `LVL` when the `LFOLVL` replaces it. A simple list has one level for every `ilvl`. */
function levelIn(list: ListDef, lfo: ListOverride, ilvl: number): ListLevel {
  const index = Math.min(ilvl, list.levels.length - 1);
  return lfo.overrides.get(index)?.level ?? (list.levels[index] as ListLevel);
}

/** The level a paragraph with this `ilfo` and `ilvl` is on, or undefined when it is not in a list. */
export function levelOf(tables: ListTables, ilfo: number, ilvl: number): ListLevel | undefined {
  const found = ilvl >= 0 && ilvl < LEVELS ? listFor(tables, ilfo) : undefined;
  return found && levelIn(found.list, found.lfo, ilvl);
}

function roman(value: number): string {
  let rest = value;
  let out = '';
  for (const [size, letters] of ROMAN) {
    while (rest >= size) {
      out += letters;
      rest -= size;
    }
  }
  return out;
}

/** Word's letters: a to z, then aa, bb, ... zz, then aaa. */
function letters(value: number, base: number): string {
  const repeat = Math.floor((value - 1) / 26) + 1;
  return String.fromCharCode(base + ((value - 1) % 26)).repeat(repeat);
}

/** A number in a number format (`nfc`). */
export function formatNumber(value: number, nfc: number): string {
  switch (nfc) {
    case Nfc.UpperRoman:
      return value > 0 && value < 4000 ? roman(value) : String(value);
    case Nfc.LowerRoman:
      return value > 0 && value < 4000 ? roman(value).toLowerCase() : String(value);
    case Nfc.UpperLetter:
      return value > 0 ? letters(value, 65) : String(value);
    case Nfc.LowerLetter:
      return value > 0 ? letters(value, 97) : String(value);
    case Nfc.ZeroDecimal:
      return value >= 0 && value < 10 ? `0${value}` : String(value);
    case Nfc.None:
      return '';
    default:
      return String(value);
  }
}

/** What a list paragraph gets: the model's `Paragraph.list`. */
export interface ListItem {
  level: number;
  marker: string;
  ordered: boolean;
}

/** What identifies a list's definition: every level's format, marker template, start, restart limit and indents. */
function definitionOf(list: ListDef): string {
  return list.levels
    .map((level) => [level.nfc, level.xst, level.startAt, level.restartLimit, level.papx.join(',')].join('|'))
    .join(';');
}

/** The numbering state of one document: a counter per level for each list. */
export class ListNumbering {
  private readonly counters = new Map<string, (number | undefined)[]>();
  /** The `LFO`s whose start overrides have been applied. */
  private readonly started = new Set<ListOverride>();
  /** The list whose counters a list uses, decided when the list is first used. */
  private readonly owners = new Map<ListDef, ListDef>();
  /** How many paragraphs each list has numbered so far. */
  private readonly uses = new Map<ListDef, number>();
  /** The list of the previous list paragraph. */
  private previousList: ListDef | undefined;

  constructor(private readonly tables: ListTables) {}

  /**
   * LibreOffice writes a one-paragraph copy of a list for a first item whose number restarts, and uses the original
   * for the items after it. So a list first used right after a copy of itself that has numbered exactly one paragraph
   * continues that copy's counters. Separate lists that merely look the same (two numbered lists in a Word file) keep
   * their own counters.
   */
  private ownerOf(list: ListDef): ListDef {
    let owner = this.owners.get(list);
    if (!owner) {
      const previous = this.previousList;
      const continuesCopy =
        previous !== undefined &&
        previous !== list &&
        this.uses.get(previous) === 1 &&
        definitionOf(previous) === definitionOf(list);
      owner = continuesCopy ? (this.owners.get(previous) ?? previous) : list;
      this.owners.set(list, owner);
    }
    return owner;
  }

  /** Counts a paragraph with this `ilfo` and `ilvl` in its list and returns its marker; undefined when it is not in a list. */
  next(ilfo: number, ilvl: number): ListItem | undefined {
    const found = ilvl >= 0 && ilvl < LEVELS ? listFor(this.tables, ilfo) : undefined;
    if (!found) return undefined;
    const { list, lfo } = found;
    const depth = Math.min(ilvl, list.levels.length - 1);
    const startOf = (index: number) => lfo.overrides.get(index)?.startAt ?? levelIn(list, lfo, index).startAt;

    const key = String(this.ownerOf(list).lsid);
    this.uses.set(list, (this.uses.get(list) ?? 0) + 1);
    this.previousList = list;
    let counters = this.counters.get(key);
    if (!counters) {
      counters = new Array<number | undefined>(LEVELS).fill(undefined);
      this.counters.set(key, counters);
    }
    if (!this.started.has(lfo)) {
      // The first paragraph of an `LFO` that overrides a start value restarts that level there.
      this.started.add(lfo);
      for (const [index, override] of lfo.overrides) if (override.startAt !== undefined) counters[index] = undefined;
    }
    const previous = counters[depth];
    counters[depth] = previous === undefined ? startOf(depth) : previous + 1;
    for (let deeper = depth + 1; deeper < LEVELS; deeper++) {
      // A level with a restart limit L (1-based) restarts only after levels 0 to L - 1.
      const limit = levelIn(list, lfo, deeper).restartLimit;
      if (limit > 0 && limit < deeper && depth > limit - 1) continue;
      counters[deeper] = undefined;
    }

    const level = levelIn(list, lfo, depth);
    const ordered = level.nfc !== Nfc.Bullet && level.nfc !== Nfc.None;
    if (level.nfc === Nfc.None) return { level: depth, marker: '', ordered };
    if (level.nfc === Nfc.Bullet) {
      return { level: depth, marker: bulletFor(level.xst) ?? (level.xst.trim() || '•'), ordered };
    }
    const current = counters;
    const marker = [...level.xst]
      .map((char) => {
        const code = char.charCodeAt(0);
        if (code >= LEVELS) return char;
        return formatNumber(current[code] ?? startOf(code), levelIn(list, lfo, code).nfc);
      })
      .join('');
    return { level: depth, marker, ordered };
  }
}

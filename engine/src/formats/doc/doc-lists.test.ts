import { describe, expect, it } from 'vitest';
import { openDocContainer } from './doc-container';
import { FcLcb, readFib } from './doc-fib';
import {
  formatNumber,
  levelOf,
  ListNumbering,
  readListTables,
  type ListDef,
  type ListLevel,
  type ListOverride,
  type ListTables,
} from './doc-lists';
import { fixture } from './doc-test-helpers';

describe('features.doc list tables', () => {
  const { fibBase, wordDocument, table } = openDocContainer(fixture('features.doc'));
  const fib = readFib(wordDocument, table.length, fibBase);
  const tables = readListTables(table, fib.pair(FcLcb.PlfLst), fib.pair(FcLcb.PlfLfo));
  const list = (lsid: number) => {
    const found = tables.lists.find((candidate) => candidate.lsid === lsid);
    if (!found) throw new Error(`no list ${lsid}`);
    return found;
  };

  it('has five lists with nine levels each, and five LFOs', () => {
    expect(tables.lists.map((l) => l.lsid)).toEqual([1, 2, 3, 4, 5]);
    expect(tables.lists.map((l) => l.levels.length)).toEqual([9, 9, 9, 9, 9]);
    expect(tables.lfos.map((l) => l.lsid)).toEqual([1, 2, 3, 4, 5]);
    expect(tables.lfos.every((l) => l.overrides.size === 0)).toBe(true);
  });

  it('reads the numbered list: decimal with a full stop, then lower letters with a bracket', () => {
    expect(list(4).levels[0]).toMatchObject({ nfc: 0, xst: '\u0000.', startAt: 1 });
    expect(list(4).levels[1]).toMatchObject({ nfc: 4, xst: '\u0001)', startAt: 1 });
  });

  it('reads the bullet list: the Symbol bullet in the private-use area, then a white bullet', () => {
    expect(list(5).levels[0]).toMatchObject({ nfc: 23, xst: '' });
    expect(list(5).levels[1]).toMatchObject({ nfc: 23, xst: '◦' });
  });

  it('takes the level indents from the level paragraph properties', () => {
    for (const lsid of [4, 5]) {
      expect(list(lsid).levels[0]).toMatchObject({ indentLeft: 720, indentFirst: -360 });
      expect(list(lsid).levels[1]).toMatchObject({ indentLeft: 1440, indentFirst: -360 });
    }
  });

  it('finds a level by ilfo (1-based) and ilvl', () => {
    expect(levelOf(tables, 4, 1)?.xst).toBe('\u0001)');
    expect(levelOf(tables, 0, 0)).toBeUndefined();
    expect(levelOf(tables, 6, 0)).toBeUndefined();
    expect(levelOf(tables, 4, 9)).toBeUndefined();
  });

  it('returns no lists for absent structures', () => {
    expect(readListTables(table, undefined, undefined)).toEqual({ lists: [], lfos: [] });
  });

  it('keeps the lists it could read when the stream ends inside a level', () => {
    const lst = fib.pair(FcLcb.PlfLst)!;
    const cut = readListTables(table.subarray(0, lst.fc + 2 + 5 * 28 + 600), lst, undefined);
    expect(cut.lists.length).toBeGreaterThan(0);
    expect(cut.lists.length).toBeLessThan(5);
  });
});

/** Bytes of a `PlfLst` and `PlfLfo` built from simple descriptions. */
describe('readListTables on built data', () => {
  const le16 = (v: number) => [v & 0xff, (v >> 8) & 0xff];
  const le32 = (v: number) => [...le16(v & 0xffff), ...le16(v >>> 16)];
  const lvl = (nfc: number, xst: string, startAt = 1, papx: number[] = []) => [
    ...le32(startAt),
    nfc,
    0,
    ...new Array<number>(9).fill(0),
    0,
    ...le32(0),
    ...le32(0),
    0, // cbGrpprlChpx
    papx.length,
    0, // ilvlRestartLim
    0,
    ...papx,
    ...le16(xst.length),
    ...[...xst].flatMap((c) => le16(c.charCodeAt(0))),
  ];
  const lstf = (lsid: number, simple: boolean) => [
    ...le32(lsid),
    ...le32(0),
    ...new Array<number>(18).fill(0),
    simple ? 1 : 0,
    0,
  ];

  it('reads a simple list with one level, and an LFOLVL that sets a start and one that replaces the level', () => {
    const lst = [...le16(1), ...lstf(7, true), ...lvl(1, '\u0000.', 1, [0x5e, 0x84, 0xd0, 0x02])];
    const lfoLvlStart = [...le32(5), ...le32(0x10)];
    const lfoLvlFormat = [...le32(1), ...le32(0x20), ...lvl(3, '\u0000)')];
    const lfo = (clfolvl: number) => [...le32(7), ...le32(0), ...le32(0), clfolvl, 0, 0, 0];
    const plfLfo = [...le32(2), ...lfo(1), ...lfo(1), ...le32(0), ...lfoLvlStart, ...le32(0), ...lfoLvlFormat];
    const stream = Uint8Array.from([...lst, ...plfLfo]);
    const tables = readListTables(stream, { fc: 0, lcb: lst.length }, { fc: lst.length, lcb: plfLfo.length });

    expect(tables.lists).toHaveLength(1);
    expect(tables.lists[0]?.levels).toHaveLength(1);
    expect(tables.lists[0]?.levels[0]).toMatchObject({ nfc: 1, xst: '\u0000.', indentLeft: 720 });
    expect(tables.lfos).toHaveLength(2);
    expect(tables.lfos[0]?.overrides.get(0)).toEqual({ startAt: 5 });
    expect(tables.lfos[1]?.overrides.get(0)?.level).toMatchObject({ nfc: 3, xst: '\u0000)' });
  });
});

describe('formatNumber', () => {
  it('formats decimal, with a leading zero below ten, and none', () => {
    expect(formatNumber(7, 0)).toBe('7');
    expect(formatNumber(12, 0)).toBe('12');
    expect(formatNumber(7, 22)).toBe('07');
    expect(formatNumber(12, 22)).toBe('12');
    expect(formatNumber(7, 255)).toBe('');
  });

  it('formats Roman numerals', () => {
    expect([1, 4, 9, 14, 40, 90, 400, 1994, 3999].map((n) => formatNumber(n, 1))).toEqual([
      'I',
      'IV',
      'IX',
      'XIV',
      'XL',
      'XC',
      'CD',
      'MCMXCIV',
      'MMMCMXCIX',
    ]);
    expect(formatNumber(4, 2)).toBe('iv');
    expect(formatNumber(4000, 2)).toBe('4000');
  });

  it('formats letters as Word does: a to z, then aa, bb, and aaa', () => {
    expect([1, 2, 26, 27, 28, 52, 53].map((n) => formatNumber(n, 4))).toEqual(['a', 'b', 'z', 'aa', 'bb', 'zz', 'aaa']);
    expect(formatNumber(27, 3)).toBe('AA');
    expect(formatNumber(0, 4)).toBe('0');
  });

  it('falls back to decimal for other formats', () => {
    expect(formatNumber(3, 5)).toBe('3');
    expect(formatNumber(3, 14)).toBe('3');
  });
});

describe('ListNumbering', () => {
  const level = (nfc: number, xst: string, extra: Partial<ListLevel> = {}): ListLevel => ({
    startAt: 1,
    nfc,
    restartLimit: 0,
    xst,
    papx: new Uint8Array(0),
    ...extra,
  });
  /** A list of nine levels: the given ones, then plain decimal levels. */
  const listOf = (lsid: number, levels: ListLevel[]): ListDef => ({
    lsid,
    levels: [...levels, ...Array.from({ length: 9 - levels.length }, (_, i) => level(0, `\u0000${i}`))],
  });
  const lfoOf = (lsid: number, overrides: ListOverride['overrides'] = new Map()): ListOverride => ({ lsid, overrides });
  const markers = (tables: ListTables, items: [ilfo: number, ilvl: number][]) => {
    const numbering = new ListNumbering(tables);
    return items.map(([ilfo, ilvl]) => numbering.next(ilfo, ilvl)?.marker);
  };

  const outline = listOf(1, [
    level(0, '\u0000.'),
    level(4, '\u0001)'),
    level(2, '\u0002.'),
    level(0, '\u0000.\u0001.\u0002'),
  ]);

  it('counts a level up and restarts the deeper ones', () => {
    const tables = { lists: [outline], lfos: [lfoOf(1)] };
    expect(
      markers(tables, [
        [1, 0],
        [1, 1],
        [1, 1],
        [1, 2],
        [1, 0],
        [1, 1],
      ]),
    ).toEqual(['1.', 'a)', 'b)', 'i.', '2.', 'a)']);
  });

  it('builds a marker from several levels: 1.2.3', () => {
    const multi = listOf(2, [level(0, '\u0000.'), level(0, '\u0000.\u0001'), level(0, '\u0000.\u0001.\u0002')]);
    const tables = { lists: [multi], lfos: [lfoOf(2)] };
    expect(
      markers(tables, [
        [1, 0],
        [1, 1],
        [1, 1],
        [1, 2],
        [1, 2],
        [1, 2],
        [1, 0],
        [1, 1],
        [1, 2],
      ]),
    ).toEqual(['1.', '1.1', '1.2', '1.2.1', '1.2.2', '1.2.3', '2.', '2.1', '2.1.1']);
  });

  it('uses each level’s own format for the numbers it names, and shows an unvisited level at its start', () => {
    const mixed = listOf(3, [level(1, '\u0000.'), level(4, '\u0000.\u0001)')]);
    expect(
      markers({ lists: [mixed], lfos: [lfoOf(3)] }, [
        [1, 1],
        [1, 1],
        [1, 0],
        [1, 1],
      ]),
    ).toEqual(['I.a)', 'I.b)', 'I.', 'I.a)']);
  });

  it('shares counters between two LFOs of the same list', () => {
    const tables = { lists: [outline], lfos: [lfoOf(1), lfoOf(1)] };
    expect(
      markers(tables, [
        [1, 0],
        [2, 0],
        [1, 0],
        [2, 1],
      ]),
    ).toEqual(['1.', '2.', '3.', 'a)']);
  });

  it('keeps separate counters for lists with different definitions', () => {
    const other = listOf(2, [level(0, '\u0000)')]);
    const tables = { lists: [outline, other], lfos: [lfoOf(1), lfoOf(2)] };
    expect(
      markers(tables, [
        [1, 0],
        [2, 0],
        [1, 0],
        [2, 0],
      ]),
    ).toEqual(['1.', '1)', '2.', '2)']);
  });

  it('continues a one-paragraph copy of a list in the list used right after it (LibreOffice restarted first item)', () => {
    const copy = { ...outline, lsid: 4 };
    const tables = { lists: [outline, copy], lfos: [lfoOf(1), lfoOf(4)] };
    expect(
      markers(tables, [
        [2, 0],
        [1, 1],
        [1, 0],
      ]),
    ).toEqual(['1.', 'a)', '2.']);
  });

  it('keeps separate counters for separate lists with the same definition (two numbered lists in a Word file)', () => {
    const second = { ...outline, lsid: 2 };
    const tables = { lists: [outline, second], lfos: [lfoOf(1), lfoOf(2)] };
    expect(
      markers(tables, [
        [1, 0],
        [1, 0],
        [1, 0],
        [2, 0],
        [2, 0],
      ]),
    ).toEqual(['1.', '2.', '3.', '1.', '2.']);
  });

  it('starts a level at the LFOLVL start value, once, when the LFO is first used', () => {
    const tables = {
      lists: [outline],
      lfos: [lfoOf(1), lfoOf(1, new Map([[0, { startAt: 5 }]]))],
    };
    expect(
      markers(tables, [
        [1, 0],
        [1, 0],
        [2, 0],
        [2, 0],
        [1, 0],
      ]),
    ).toEqual(['1.', '2.', '5.', '6.', '7.']);
  });

  it('starts at the level’s own start value, and again after a restart', () => {
    const from3 = listOf(1, [level(0, '\u0000.', { startAt: 3 }), level(0, '\u0001)', { startAt: 10 })]);
    expect(
      markers({ lists: [from3], lfos: [lfoOf(1)] }, [
        [1, 0],
        [1, 1],
        [1, 0],
        [1, 1],
      ]),
    ).toEqual(['3.', '10)', '4.', '10)']);
  });

  it('uses the level an LFOLVL replaces', () => {
    const tables = {
      lists: [outline],
      lfos: [lfoOf(1, new Map([[0, { level: level(3, '\u0000-') }]]))],
    };
    expect(
      markers(tables, [
        [1, 0],
        [1, 0],
      ]),
    ).toEqual(['A-', 'B-']);
  });

  it('honours ilvlRestartLim: a level with limit 1 restarts only after level 0', () => {
    const limited = listOf(1, [level(0, '\u0000.'), level(0, '\u0001)'), level(0, '\u0002]', { restartLimit: 1 })]);
    expect(
      markers({ lists: [limited], lfos: [lfoOf(1)] }, [
        [1, 0],
        [1, 1],
        [1, 2],
        [1, 1],
        [1, 2],
        [1, 0],
        [1, 1],
        [1, 2],
      ]),
    ).toEqual(['1.', '1)', '1]', '2)', '2]', '2.', '1)', '1]']);
  });

  it('gives bullets through the bullet table and marks them unordered', () => {
    const bullets = listOf(1, [level(23, ''), level(23, '◦'), level(23, '')]);
    const numbering = new ListNumbering({ lists: [bullets], lfos: [lfoOf(1)] });
    expect(numbering.next(1, 0)).toEqual({ level: 0, marker: '•', ordered: false });
    expect(numbering.next(1, 1)).toEqual({ level: 1, marker: '◦', ordered: false });
    expect(numbering.next(1, 2)).toEqual({ level: 2, marker: '•', ordered: false });
  });

  it('gives no marker for nfc 255', () => {
    const none = listOf(1, [level(255, '')]);
    expect(new ListNumbering({ lists: [none], lfos: [lfoOf(1)] }).next(1, 0)).toEqual({
      level: 0,
      marker: '',
      ordered: false,
    });
  });

  it('gives nothing for an ilfo or ilvl that names no list', () => {
    const tables = { lists: [outline], lfos: [lfoOf(1), lfoOf(99)] };
    expect(
      markers(tables, [
        [0, 0],
        [3, 0],
        [2, 0],
        [1, 9],
        [1, -1],
      ]),
    ).toEqual([undefined, undefined, undefined, undefined, undefined]);
  });

  it('uses the one level of a simple list for every ilvl', () => {
    const simple: ListDef = { lsid: 1, levels: [level(0, '\u0000.')] };
    expect(
      markers({ lists: [simple], lfos: [lfoOf(1)] }, [
        [1, 0],
        [1, 3],
      ]),
    ).toEqual(['1.', '2.']);
  });
});

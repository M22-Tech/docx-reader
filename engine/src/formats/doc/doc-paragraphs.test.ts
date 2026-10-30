import { describe, expect, it } from 'vitest';
import type { Block, Inline, Paragraph, Table } from '../../model/document-model';
import { buildBlocks, type DocFormat } from './doc-paragraphs';
import { blipRecord, pictureData } from './doc-test-helpers';
import type { ListLevel, ListTables } from './doc-lists';
import { Sprm } from './doc-sprm';
import { createStyleSheet } from './doc-styles';

/** Paragraph text with [tab], [br] and {link: text} markers; page breaks are "---". */
function show(blocks: Block[]): string[] {
  const inlines = (list: Inline[]): string =>
    list
      .map((i) => {
        if (i.kind === 'text') return i.text;
        if (i.kind === 'lineBreak') return '[br]';
        if (i.kind === 'tab') return '[tab]';
        if (i.kind === 'link') return `{${i.href}: ${inlines(i.inlines)}}`;
        return `<${i.kind}>`;
      })
      .join('');
  return blocks.map((b) => (b.kind === 'paragraph' ? inlines(b.inlines) : '---'));
}

describe('buildBlocks', () => {
  it('ends a paragraph at 0x0D and keeps empty paragraphs', () => {
    expect(show(buildBlocks('one\r\rtwo\r'))).toEqual(['one', '', 'two']);
  });

  it('keeps a last paragraph that has no mark', () => {
    expect(show(buildBlocks('one\rtwo'))).toEqual(['one', 'two']);
    expect(buildBlocks('')).toEqual([]);
  });

  it('turns 0x0B and 0x09 into inlines', () => {
    expect(show(buildBlocks('a\x0bb\tc\r'))).toEqual(['a[br]b[tab]c']);
  });

  it('makes each cell a paragraph and leaves out the row-end mark', () => {
    expect(show(buildBlocks('A\x07B\x07\x07C\x07D\x07\x07after\r'))).toEqual(['A', 'B', 'C', 'D', 'after']);
  });

  it('ends the paragraph at 0x0C and adds a page break', () => {
    expect(show(buildBlocks('one\x0c\rtwo\r'))).toEqual(['one', '---', '', 'two']);
    expect(show(buildBlocks('one\r\x0ctwo\r'))).toEqual(['one', '---', 'two']);
    expect(buildBlocks('a\x0cb')).toEqual([
      { kind: 'paragraph', inlines: [{ kind: 'text', text: 'a' }] },
      { kind: 'pageBreak' },
      { kind: 'paragraph', inlines: [{ kind: 'text', text: 'b' }] },
    ]);
  });

  it('maps the non-breaking hyphen and drops the optional hyphen and unhandled control marks', () => {
    expect(show(buildBlocks('a\x1eb\x1fc\x01\x02\x05\x08d\x00e\r'))).toEqual(['a‑bcde']);
  });

  it('keeps text in other scripts unchanged', () => {
    expect(show(buildBlocks('हिन्दी বাংলা\r'))).toEqual(['हिन्दी বাংলা']);
  });

  it('builds links from hyperlink fields, with no instruction text', () => {
    const blocks = buildBlocks('See \x13HYPERLINK "https://x.test/"\x01\x14the\tsite\x0bnow\x15 ok\r');
    expect(show(blocks)).toEqual(['See {https://x.test/: the[tab]site[br]now} ok']);
  });

  it('shows other fields as their result', () => {
    expect(show(buildBlocks('Page \x13 PAGE \x147\x15 of \x13 NUMPAGES \x149\x15\r'))).toEqual(['Page 7 of 9']);
  });

  it('splits a link at a paragraph end inside its result', () => {
    expect(show(buildBlocks('\x13HYPERLINK "#a"\x14one\rtwo\x15\r'))).toEqual(['{#a: one}', '{#a: two}']);
  });

  it('starts a new link for a second field', () => {
    const blocks = buildBlocks('\x13HYPERLINK "#a"\x14x\x15 \x13HYPERLINK "#b"\x14y\x15\r');
    expect(show(blocks)).toEqual(['{#a: x} {#b: y}']);
  });
});

describe('buildBlocks with formatting', () => {
  const FC = 0x800;
  const fc = (cp: number) => FC + cp * 2;
  const bytes = (...values: number[]) => Uint8Array.from(values);
  const sprm = (id: number, ...operand: number[]) => [id & 0xff, id >> 8, ...operand];
  const normal = createStyleSheet([
    {
      istd: 0,
      sti: 0,
      kind: 'paragraph',
      name: 'Normal',
      paraGrpprl: new Uint8Array(0),
      // 11 pt, so runs carry only the marks a test sets.
      charGrpprl: bytes(...sprm(Sprm.CHps, 22, 0)),
    },
  ]);
  /** Character runs and paragraph runs by CP range, over one Unicode piece starting at CP 0. */
  function format(
    length: number,
    chars: [number, number, number[]][],
    paras: [number, number, number[]][] = [],
  ): DocFormat {
    const piece = { cpStart: 0, cpEnd: length, fc: FC, compressed: false, prm: 0 };
    return {
      text: { prcs: [], pieces: [piece], cpEnd: length, text: () => '', cpToFc: (cp) => fc(cp) },
      chpx: chars.map(([from, to, grpprl]) => ({ fcStart: fc(from), fcEnd: fc(to), grpprl: bytes(...grpprl) })),
      papx: paras.map(([from, to, grpprl]) => ({
        fcStart: fc(from),
        fcEnd: fc(to),
        grpprl: bytes(...grpprl),
        istd: 0,
      })),
      styles: normal,
      fonts: [],
    };
  }
  const runs = (blocks: Block[]) =>
    blocks.flatMap((b) =>
      b.kind === 'paragraph'
        ? b.inlines.map((i) => (i.kind === 'text' ? `${i.text}${i.marks?.bold ? '*' : ''}` : i.kind))
        : ['---'],
    );
  const BOLD = sprm(Sprm.CFBold, 1);

  it('splits runs at every change of character properties', () => {
    const blocks = buildBlocks(
      'one two\r',
      format(8, [
        [0, 4, []],
        [4, 7, BOLD],
        [7, 8, []],
      ]),
    );
    expect(runs(blocks)).toEqual(['one ', 'two*']);
  });

  it('keeps marks aligned with their characters across field instructions and dropped control characters', () => {
    const text = 'a\x13X\x14b\x15\x01c\r';
    const blocks = buildBlocks(
      text,
      format(text.length, [
        [0, 7, []],
        [7, 8, BOLD],
        [8, 9, []],
      ]),
    );
    expect(runs(blocks)).toEqual(['ab', 'c*']);
  });

  it('drops hidden text, tabs and line breaks, and a paragraph that is hidden entirely', () => {
    const text = 'a\tb\x0bc\rgone\rkept\r';
    const hidden = sprm(Sprm.CFVanish, 1);
    const blocks = buildBlocks(
      text,
      format(text.length, [
        [1, 2, hidden],
        [3, 4, hidden],
        [6, 11, hidden],
      ]),
    );
    expect(runs(blocks)).toEqual(['abc', 'kept']);
  });

  it('keeps an empty paragraph whose mark is not hidden', () => {
    const blocks = buildBlocks('gone\r', format(5, [[0, 4, sprm(Sprm.CFRMarkDel, 1)]]));
    expect(blocks).toEqual([{ kind: 'paragraph', inlines: [] }]);
  });

  it('adds a page break before a paragraph with sprmPFPageBreakBefore, but not at the start', () => {
    const pagebb = sprm(Sprm.PFPageBreakBefore, 1);
    const blocks = buildBlocks(
      'one\rtwo\r',
      format(
        8,
        [],
        [
          [0, 4, pagebb],
          [4, 8, pagebb],
        ],
      ),
    );
    expect(runs(blocks)).toEqual(['one', '---', 'two']);
  });

  it('puts paragraph properties on the paragraph found by its mark', () => {
    const blocks = buildBlocks('one\rtwo\r', format(8, [], [[4, 8, sprm(Sprm.PJc, 1)]]));
    expect(blocks.map((b) => (b.kind === 'paragraph' ? b.align : undefined))).toEqual([undefined, 'center']);
  });

  describe('tables', () => {
    const inTable = (depth: number) => [...sprm(Sprm.PFInTable, 1), ...sprm(Sprm.PItap, depth, 0, 0, 0)];
    /** `sprmTDefTable` for a row of `cells` cells, each 1000 twips wide. */
    const rowDef = (cells: number) => {
      const centers = Array.from({ length: cells + 1 }, (_, i) => i * 1000);
      const data = [cells, ...centers.flatMap((c) => [c & 0xff, c >> 8]), ...new Array<number>(cells * 20).fill(0)];
      return sprm(Sprm.TDefTable, (data.length + 1) & 0xff, (data.length + 1) >> 8, ...data);
    };
    const paragraphText = (b: Block | undefined) =>
      b?.kind === 'paragraph' ? b.inlines.map((i) => (i.kind === 'text' ? i.text : '')).join('') : b?.kind;

    it('builds a table from cell and row marks, keeping an empty cell and dropping the row mark', () => {
      const text = 'A\x07\x07\x07after\r';
      const blocks = buildBlocks(
        text,
        format(
          text.length,
          [],
          [
            [0, 2, inTable(1)],
            [2, 3, inTable(1)],
            [3, 4, [...inTable(1), ...sprm(Sprm.PFTtp, 1), ...sprm(Sprm.TTableHeader, 1), ...rowDef(2)]],
          ],
        ),
      );
      expect(blocks.map((b) => b.kind)).toEqual(['table', 'paragraph']);
      const table = blocks[0] as Table;
      expect(table.rows).toHaveLength(1);
      expect(table.rows[0]?.header).toBe(true);
      expect(table.rows[0]?.cells.map((c) => c.blocks.map(paragraphText))).toEqual([['A'], ['']]);
      expect(paragraphText(blocks[1])).toBe('after');
    });

    it('builds a nested table from cells that end with a paragraph mark and the inner-row flags', () => {
      const text = 'out\ri\r\r\x07\x07after\r';
      const blocks = buildBlocks(
        text,
        format(
          text.length,
          [],
          [
            [0, 4, inTable(1)],
            [4, 6, [...inTable(2), ...sprm(Sprm.PFInnerTableCell, 1)]],
            [6, 7, [...inTable(2), ...sprm(Sprm.PFInnerTtp, 1), ...rowDef(1)]],
            [7, 8, inTable(1)],
            [8, 9, [...inTable(1), ...sprm(Sprm.PFTtp, 1), ...rowDef(1)]],
          ],
        ),
      );
      expect(blocks.map((b) => b.kind)).toEqual(['table', 'paragraph']);
      const cell = (blocks[0] as Table).rows[0]?.cells[0]?.blocks as Block[];
      expect(cell.map((b) => b.kind)).toEqual(['paragraph', 'table', 'paragraph']);
      expect(paragraphText(cell[0])).toBe('out');
      const inner = cell[1] as Table;
      expect(inner.rows[0]?.cells.map((c) => c.blocks.map(paragraphText))).toEqual([['i']]);
    });

    it('keeps a cell whose paragraph is entirely hidden, as an empty cell', () => {
      const text = 'gone\x07\x07';
      const blocks = buildBlocks(
        text,
        format(
          text.length,
          [[0, 5, sprm(Sprm.CFVanish, 1)]],
          [
            [0, 5, inTable(1)],
            [5, 6, [...inTable(1), ...sprm(Sprm.PFTtp, 1), ...rowDef(1)]],
          ],
        ),
      );
      expect((blocks[0] as Table).rows[0]?.cells[0]?.blocks).toEqual([{ kind: 'paragraph', inlines: [] }]);
    });

    it('gives no paragraph for a stray cell mark outside a table', () => {
      expect(runs(buildBlocks('\x07x\r', format(3, [])))).toEqual(['x']);
    });
  });

  describe('lists', () => {
    const level = (nfc: number, xst: string, left: number): ListLevel => ({
      startAt: 1,
      nfc,
      restartLimit: 0,
      xst,
      papx: bytes(...sprm(Sprm.PDxaLeft, left & 0xff, left >> 8), ...sprm(Sprm.PDxaLeft1, 0x98, 0xfe)),
    });
    const lists: ListTables = {
      lists: [
        {
          lsid: 9,
          levels: [
            level(0, '\u0000.', 720),
            level(4, '\u0001)', 1440),
            ...Array.from({ length: 7 }, () => level(0, '\u0002.', 2160)),
          ],
        },
      ],
      lfos: [{ lsid: 9, overrides: new Map() }],
    };
    const item = (ilvl: number, ...extra: number[]) => [...sprm(Sprm.PIlfo, 1, 0), ...sprm(Sprm.PIlvl, ilvl), ...extra];

    it('numbers list paragraphs and takes the indents from their level', () => {
      const text = 'one\rtwo\rthree\rplain\r';
      const blocks = buildBlocks(text, {
        ...format(
          text.length,
          [],
          [
            [0, 4, item(0)],
            [4, 8, item(1)],
            [8, 14, item(0)],
          ],
        ),
        lists,
      });
      const paragraphs = blocks as Paragraph[];
      expect(paragraphs.map((p) => p.list)).toEqual([
        { level: 0, marker: '1.', ordered: true },
        { level: 1, marker: 'a)', ordered: true },
        { level: 0, marker: '2.', ordered: true },
        undefined,
      ]);
      expect(paragraphs.map((p) => p.indentLeftMm)).toEqual([12.7, 25.4, 12.7, undefined]);
      expect(paragraphs[0]?.firstLineMm).toBe(-6.35);
    });

    it('lets the paragraph’s own indent win over its level’s', () => {
      const blocks = buildBlocks('one\r', {
        ...format(4, [], [[0, 4, item(0, ...sprm(Sprm.PDxaLeft, 200, 0))]]),
        lists,
      });
      expect((blocks[0] as Paragraph).indentLeftMm).toBe(3.528);
      expect((blocks[0] as Paragraph).list?.marker).toBe('1.');
    });

    it('does not number a paragraph whose list does not exist, or any paragraph without list tables', () => {
      const text = 'one\r';
      const unknown = [...sprm(Sprm.PIlfo, 7, 0), ...sprm(Sprm.PIlvl, 0)];
      expect((buildBlocks(text, { ...format(4, [], [[0, 4, unknown]]), lists })[0] as Paragraph).list).toBeUndefined();
      expect((buildBlocks(text, format(4, [], [[0, 4, item(0)]]))[0] as Paragraph).list).toBeUndefined();
    });

    it('does not count a paragraph that is gone', () => {
      const text = 'gone\rtwo\r';
      const blocks = buildBlocks(text, {
        ...format(
          text.length,
          [[0, 5, sprm(Sprm.CFVanish, 1)]],
          [
            [0, 5, item(0)],
            [5, 9, item(0)],
          ],
        ),
        lists,
      });
      expect(blocks.map((b) => (b as Paragraph).list?.marker)).toEqual(['1.']);
    });
  });

  describe('pictures and note references', () => {
    const SPEC = sprm(Sprm.CFSpec, 1);
    const location = (value: number) => sprm(Sprm.CPicLocation, value & 0xff, value >> 8, 0, 0);
    const PNG = pictureData({ blip: blipRecord(0xf01e, 0x6e0, 1, [1, 2, 3]) });
    const withData = (f: DocFormat): DocFormat => ({ ...f, data: PNG });
    const kinds = (blocks: Block[]) =>
      blocks.flatMap((b) =>
        b.kind === 'paragraph' ? [b.inlines.map((i) => (i.kind === 'text' ? i.text : i.kind))] : [],
      );

    it('turns a 0x01 with sprmCFSpec and sprmCPicLocation into the picture at that location', () => {
      const text = 'a\x01b\r';
      const blocks = buildBlocks(text, withData(format(4, [[1, 2, [...SPEC, ...location(0)]]])));
      expect(blocks).toEqual([
        {
          kind: 'paragraph',
          inlines: [
            { kind: 'text', text: 'a' },
            {
              kind: 'image',
              widthPx: 240,
              heightPx: 120,
              src: { mime: 'image/png', data: Uint8Array.from([1, 2, 3]) },
            },
            { kind: 'text', text: 'b' },
          ],
        },
      ]);
      expect(text).toHaveLength(4);
    });

    it('drops a 0x01 without sprmCFSpec, with sprmCFData, or whose picture has mm 0', () => {
      const noSpec = buildBlocks('a\x01b\r', withData(format(4, [[1, 2, location(0)]])));
      const fieldData = buildBlocks(
        'a\x01b\r',
        withData(format(4, [[1, 2, [...SPEC, ...sprm(Sprm.CFData, 1), ...location(0)]]])),
      );
      const notAPicture = buildBlocks('a\x01b\r', {
        ...format(4, [[1, 2, [...SPEC, ...location(0)]]]),
        data: pictureData({ mm: 0 }),
      });
      for (const blocks of [noSpec, fieldData, notAPicture]) expect(kinds(blocks)).toEqual([['ab']]);
    });

    it('gives a placeholder for a picture when there is no Data stream, and keeps a picture inside a link', () => {
      const text = '\x13HYPERLINK "https://x.test/"\x14\x01\x15\r';
      const at = text.indexOf('\x01');
      const blocks = buildBlocks(text, format(text.length, [[at, at + 1, [...SPEC, ...location(0)]]]));
      expect(blocks).toEqual([
        {
          kind: 'paragraph',
          inlines: [{ kind: 'link', href: 'https://x.test/', inlines: [{ kind: 'image', widthPx: 0, heightPx: 0 }] }],
        },
      ]);
    });

    it('never makes a picture of a 0x01 in a field instruction', () => {
      const text = 'a\x13HYPERLINK "u"\x01\x14t\x15\r';
      const blocks = buildBlocks(text, withData(format(text.length, [[17, 18, [...SPEC, ...location(0)]]])));
      expect(JSON.stringify(blocks)).not.toContain('image');
    });

    it('leaves out a hidden picture', () => {
      const hidden = [...SPEC, ...location(0), ...sprm(Sprm.CFVanish, 1)];
      expect(kinds(buildBlocks('a\x01b\r', withData(format(4, [[1, 2, hidden]]))))).toEqual([['ab']]);
    });

    it('replaces the characters named by noteRefs with the reference, and leaves other 0x02 out', () => {
      const ref = { kind: 'noteRef', noteId: 'fn1', label: '1' } as const;
      const f = { ...format(8, []), noteRefs: new Map([[2, ref]]) };
      const blocks = buildBlocks('ab\x02c\x02d\r', f);
      expect(blocks[0]?.kind === 'paragraph' && blocks[0].inlines).toEqual([
        { kind: 'text', text: 'ab' },
        ref,
        { kind: 'text', text: 'cd' },
      ]);
    });

    it('lets a custom mark character stand for the reference, and never swallows a paragraph end', () => {
      const ref = { kind: 'noteRef', noteId: 'fn1', label: '*' } as const;
      const f = { ...format(4, []), noteRefs: new Map([[1, ref]]) };
      const blocks = buildBlocks('a*b\r', f);
      expect(blocks[0]?.kind === 'paragraph' && blocks[0].inlines).toEqual([
        { kind: 'text', text: 'a' },
        ref,
        { kind: 'text', text: 'b' },
      ]);
      const mark = { ...format(2, []), noteRefs: new Map([[1, ref]]) };
      expect(buildBlocks('a\rb\r', mark)).toHaveLength(2);
    });
  });
});

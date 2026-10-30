import type { Block, Inline, Note, NoteRef } from '../../model/document-model';
import type { Fib } from './doc-fib';
import { FcLcb } from './doc-fib';
import { formatNumber } from './doc-lists';
import { buildBlocks, type DocFormat } from './doc-paragraphs';
import { DocReader } from './doc-reader';
import type { DocText } from './doc-text';

const LOWER_ROMAN = 2;
const NOTE_MARK = '\x02';
/** `FRD` is 2 bytes; `nAuto` 0 means the reference mark is custom text. */
const FRD_SIZE = 2;

/** A footnote or endnote found in the reference and text tables. */
export interface NoteSpec {
  id: string;
  label: string;
  /** The label is the reference's own text, not a number. */
  custom: boolean;
  /** The CP of the reference in the main text. */
  refCp: number;
  /** The CP range of the note's text, absolute in the document's text. */
  from: number;
  to: number;
}

/** Everything read from the note tables: the notes in model order and the references to put in the main text. */
export interface NoteTables {
  notes: NoteSpec[];
  refs: Map<number, NoteRef>;
}

function readCps(reader: DocReader, at: number, count: number): number[] {
  const cps: number[] = [];
  for (let i = 0; i < count; i++) cps.push(reader.u32(at + i * 4));
  return cps;
}

/**
 * Reads one kind of note. `refPair` is a `PlcffndRef` or `PlcfendRef`: n + 1 reference CPs, then n `FRD`s. `txtPair` is
 * the matching text PLC: n + 2 CPs relative to `partStart`, the CP where that kind's text begins; note i is
 * `[cp[i], cp[i + 1])` and the last entry only closes the part. Notes whose reference is outside the main text or whose
 * range is outside the part are left out, with their reference, so no link points nowhere.
 */
function readKind(
  table: Uint8Array,
  fib: Fib,
  text: DocText,
  kind: { ref: number; txt: number; idPrefix: string; partStart: number; partLength: number; label(n: number): string },
  into: NoteTables,
): void {
  const refPair = fib.pair(kind.ref);
  const txtPair = fib.pair(kind.txt);
  if (!refPair || !txtPair || refPair.lcb < 4 || txtPair.lcb < 8) return;
  const reader = new DocReader(table);
  const count = Math.min(Math.floor((refPair.lcb - 4) / (4 + FRD_SIZE)), Math.floor(txtPair.lcb / 4) - 2);
  if (count <= 0) return;
  const refs = readCps(reader, refPair.fc, count);
  const frdAt = refPair.fc + (count + 1) * 4;
  const texts = readCps(reader, txtPair.fc, count + 1);

  let auto = 0;
  let kept = 0;
  for (let i = 0; i < count; i++) {
    const refCp = refs[i] as number;
    const from = texts[i] as number;
    const to = texts[i + 1] as number;
    if (refCp >= Math.min(fib.ccpText, text.cpEnd) || from > to || to > kind.partLength) continue;
    if (kind.partStart + to > text.cpEnd) continue;
    // A custom mark is the character at the reference; one with nothing printable in it is numbered instead.
    const mark = reader.i16(frdAt + i * FRD_SIZE) === 0 ? text.text(refCp, refCp + 1) : '';
    const custom = mark.trim() !== '' && mark >= ' ';
    const label = custom ? mark : kind.label(++auto);
    const id = `${kind.idPrefix}${++kept}`;
    into.notes.push({ id, label, custom, refCp, from: kind.partStart + from, to: kind.partStart + to });
    into.refs.set(refCp, { kind: 'noteRef', noteId: id, label });
  }
}

/** Reads the footnote and endnote tables: footnotes first, then endnotes, each in reference order. */
export function readNoteTables(table: Uint8Array, fib: Fib, text: DocText): NoteTables {
  const tables: NoteTables = { notes: [], refs: new Map() };
  readKind(
    table,
    fib,
    text,
    {
      ref: FcLcb.PlcffndRef,
      txt: FcLcb.PlcffndTxt,
      idPrefix: 'fn',
      partStart: fib.ccpText,
      partLength: fib.ccpFtn,
      label: (n) => String(n),
    },
    tables,
  );
  readKind(
    table,
    fib,
    text,
    {
      ref: FcLcb.PlcfendRef,
      txt: FcLcb.PlcfendTxt,
      idPrefix: 'en',
      partStart: fib.ccpText + fib.ccpFtn + fib.ccpHdd + fib.ccpAtn,
      partLength: fib.ccpEdn,
      label: (n) => formatNumber(n, LOWER_ROMAN),
    },
    tables,
  );
  return tables;
}

/** Removes the whitespace that separates the reference mark from the note's first word. */
function trimLead(blocks: Block[]): void {
  const first = blocks[0];
  const lead: Inline | undefined = first?.kind === 'paragraph' ? first.inlines[0] : undefined;
  if (lead?.kind !== 'text') return;
  lead.text = lead.text.trimStart();
  if (lead.text === '' && first?.kind === 'paragraph') first.inlines.shift();
}

/**
 * Parses each note's text with the code of the main text. The note's own mark (a leading `0x02`, or for a custom mark its
 * text) is dropped, and so is the space after it.
 */
export function buildNotes(specs: readonly NoteSpec[], text: DocText, format: DocFormat): Note[] {
  return specs.map((spec) => {
    let { from } = spec;
    const body = text.text(from, spec.to);
    if (body.startsWith(NOTE_MARK)) from += 1;
    else if (spec.custom && body.startsWith(spec.label)) from += spec.label.length;
    const blocks = buildBlocks(text.text(from, spec.to), format, from);
    trimLead(blocks);
    return { id: spec.id, label: spec.label, blocks };
  });
}

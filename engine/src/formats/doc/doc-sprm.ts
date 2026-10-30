/** Property modifiers (sprms) the parser reads, with the values [MS-DOC] gives them. */
export const Sprm = {
  // Character
  CFRMarkDel: 0x0800,
  CFData: 0x0806,
  CFSpec: 0x0855,
  CFBold: 0x0835,
  CFItalic: 0x0836,
  CFStrike: 0x0837,
  CFVanish: 0x083c,
  CHighlight: 0x2a0c,
  CKul: 0x2a3e,
  CIco: 0x2a42,
  CIss: 0x2a48,
  CHps: 0x4a43,
  CIstd: 0x4a30,
  CPicLocation: 0x6a03,
  CRgFtc0: 0x4a4f,
  CRgFtc2: 0x4a51,
  CCv: 0x6870,
  // Paragraph
  PJc80: 0x2403,
  PFPageBreakBefore: 0x2407,
  POutLvl: 0x2640,
  PJc: 0x2461,
  PDxaRight80: 0x840e,
  PDxaLeft80: 0x840f,
  PDxaLeft180: 0x8411,
  PDxaRight: 0x845d,
  PDxaLeft: 0x845e,
  PDxaLeft1: 0x8460,
  PDyaLine: 0x6412,
  PDyaBefore: 0xa413,
  PDyaAfter: 0xa414,
  PChgTabs: 0xc615,
  PIlvl: 0x260a,
  PIlfo: 0x460b,
  PFInTable: 0x2416,
  PFTtp: 0x2417,
  PFInnerTableCell: 0x244b,
  PFInnerTtp: 0x244c,
  PItap: 0x6649,
  // Table
  TTableHeader: 0x3404,
  TDefTable: 0xd608,
  // Section
  SXaPage: 0xb01f,
  SYaPage: 0xb020,
  SDxaLeft: 0xb021,
  SDxaRight: 0xb022,
  SDyaTop: 0x9023,
  SDyaBottom: 0x9024,
} as const;

/** One property modifier with its operand; for a variable-size operand the size prefix is not part of `operand`. */
export interface Prl {
  sprm: number;
  operand: Uint8Array;
}

const SPRA_SIZES = [1, 1, 2, 4, 2, 2, -1, 3] as const;

/** The size of a `sprmPChgTabs` operand after its first byte `cb` (255 means the counts give the size), or undefined when the grpprl is too short. */
function chgTabsSize(grpprl: Uint8Array, at: number): number | undefined {
  const cb = grpprl[at];
  if (cb === undefined) return undefined;
  if (cb !== 255) return cb;
  const delMax = grpprl[at + 1];
  if (delMax === undefined) return undefined;
  const addMax = grpprl[at + 2 + delMax * 4];
  if (addMax === undefined) return undefined;
  // cb, itbdDelMax, rgdxaDel and rgdxaClose (2 bytes each), itbdAddMax, rgdxaAdd (2 bytes) and rgtbdAdd (1 byte).
  return 2 + delMax * 4 + 1 + addMax * 3 - 1;
}

/** Iterates a `grpprl`. A sprm that runs past the end of the `grpprl` ends the iteration; unknown sprms are skipped by size. */
export function* readSprms(grpprl: Uint8Array): Generator<Prl> {
  let at = 0;
  while (at + 2 <= grpprl.length) {
    const sprm = grpprl[at]! | (grpprl[at + 1]! << 8);
    at += 2;
    const spra = sprm >> 13;
    let start = at;
    let size = SPRA_SIZES[spra] as number;
    if (size < 0) {
      if (sprm === Sprm.TDefTable) {
        if (at + 2 > grpprl.length) return;
        // The 2-byte size counts itself and the data that follows, less one.
        size = (grpprl[at]! | (grpprl[at + 1]! << 8)) - 1;
        start = at + 2;
      } else if (sprm === Sprm.PChgTabs) {
        const rest = chgTabsSize(grpprl, at);
        if (rest === undefined) return;
        size = rest;
        start = at + 1;
      } else {
        if (at >= grpprl.length) return;
        size = grpprl[at]!;
        start = at + 1;
      }
    }
    if (size < 0 || start + size > grpprl.length) return;
    yield { sprm, operand: grpprl.subarray(start, start + size) };
    at = start + size;
  }
}

/** The sprm a `Prm0`'s `isprm` stands for, for the character sprms the parser reads; undefined for any other. */
export function prm0Sprm(isprm: number): number | undefined {
  switch (isprm) {
    case 0x41:
      return Sprm.CFRMarkDel;
    case 0x4d:
      return Sprm.CHighlight;
    case 0x55:
      return Sprm.CFBold;
    case 0x56:
      return Sprm.CFItalic;
    case 0x57:
      return Sprm.CFStrike;
    case 0x5c:
      return Sprm.CFVanish;
    case 0x5e:
      return Sprm.CKul;
    case 0x62:
      return Sprm.CIco;
    case 0x68:
      return Sprm.CIss;
    default:
      return undefined;
  }
}

export const u8 = (operand: Uint8Array): number => operand[0] ?? 0;
export const u16 = (operand: Uint8Array): number => (operand[0] ?? 0) | ((operand[1] ?? 0) << 8);
export const i16 = (operand: Uint8Array): number => (u16(operand) << 16) >> 16;
export const u32 = (operand: Uint8Array): number => (u16(operand) | (u16(operand.subarray(2)) << 16)) >>> 0;

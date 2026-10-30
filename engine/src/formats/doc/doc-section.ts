import type { PageSetup } from '../../model/document-model';
import { twipsToMm } from '../shared/units';
import type { FcLcbPair } from './doc-fib';
import { DocReader } from './doc-reader';
import { i16, readSprms, Sprm, u16 } from './doc-sprm';

const SED_SIZE = 12;
const NO_SEPX = 0xffffffff;

/** Word's defaults in twips: Letter, 1 inch top and bottom, 1.25 inch left and right. */
const DEFAULTS = { width: 12240, height: 15840, top: 1440, bottom: 1440, left: 1800, right: 1800 };

const round = (value: number) => Math.round(value * 1000) / 1000;

/** The first section's page setup, from its `SEPX` in `PlcfSed`; missing values take Word's defaults. */
export function readPageSetup(wordDocument: Uint8Array, table: Uint8Array, plcfSed: FcLcbPair): PageSetup | undefined {
  if (plcfSed.lcb < 4 + SED_SIZE) return undefined;
  const reader = new DocReader(table);
  const fcSepx = reader.u32(plcfSed.fc + 8 + 2);
  const sizes = { ...DEFAULTS };
  if (fcSepx !== NO_SEPX) {
    const stream = new DocReader(wordDocument);
    const cb = stream.u16(fcSepx);
    for (const { sprm, operand } of readSprms(stream.bytes(fcSepx + 2, Math.min(cb, stream.length - fcSepx - 2)))) {
      switch (sprm) {
        case Sprm.SXaPage:
          sizes.width = u16(operand);
          break;
        case Sprm.SYaPage:
          sizes.height = u16(operand);
          break;
        case Sprm.SDxaLeft:
          sizes.left = u16(operand);
          break;
        case Sprm.SDxaRight:
          sizes.right = u16(operand);
          break;
        // A negative top or bottom margin means the header or footer may push the text; its size is the same.
        case Sprm.SDyaTop:
          sizes.top = Math.abs(i16(operand));
          break;
        case Sprm.SDyaBottom:
          sizes.bottom = Math.abs(i16(operand));
          break;
        default:
      }
    }
  }
  return {
    widthMm: round(twipsToMm(sizes.width)),
    heightMm: round(twipsToMm(sizes.height)),
    marginTopMm: round(twipsToMm(sizes.top)),
    marginRightMm: round(twipsToMm(sizes.right)),
    marginBottomMm: round(twipsToMm(sizes.bottom)),
    marginLeftMm: round(twipsToMm(sizes.left)),
  };
}

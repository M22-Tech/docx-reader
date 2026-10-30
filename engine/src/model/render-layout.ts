import type { DocumentModel, PageSetup } from './document-model';
import { mmToPx, safeNumber } from './html';
import { renderBody, styleAttr } from './render-shared';

/** A4 portrait with 2.54 cm margins, for documents without page setup. */
const DEFAULT_PAGE: PageSetup = {
  widthMm: 210,
  heightMm: 297,
  marginTopMm: 25.4,
  marginRightMm: 25.4,
  marginBottomMm: 25.4,
  marginLeftMm: 25.4,
};

function pageValue(value: number | undefined, fallback: number, min: number): number {
  const n = safeNumber(value);
  return n !== undefined && n >= min ? n : fallback;
}

/** Renders the model as one sheet at the page width; `pageWidthPx` is the width in CSS pixels. */
export function renderLayout(model: DocumentModel): { html: string; pageWidthPx: number } {
  const page = model.page ?? DEFAULT_PAGE;
  const width = pageValue(page.widthMm, DEFAULT_PAGE.widthMm, 1);
  const top = pageValue(page.marginTopMm, DEFAULT_PAGE.marginTopMm, 0);
  const right = pageValue(page.marginRightMm, DEFAULT_PAGE.marginRightMm, 0);
  const bottom = pageValue(page.marginBottomMm, DEFAULT_PAGE.marginBottomMm, 0);
  const left = pageValue(page.marginLeftMm, DEFAULT_PAGE.marginLeftMm, 0);
  const style = styleAttr([`width:${width}mm`, `padding:${top}mm ${right}mm ${bottom}mm ${left}mm`]);
  return {
    html: `<div class="dr-sheet"${style}>${renderBody(model, 'layout')}</div>`,
    pageWidthPx: Math.round(mmToPx(width)),
  };
}

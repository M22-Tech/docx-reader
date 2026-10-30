import type { DocumentModel } from './document-model';
import { renderBody } from './render-shared';

/** Renders the model as reflowable HTML, styled only by `reading.css`. */
export function renderReading(model: DocumentModel): string {
  return `<div class="dr-reading">${renderBody(model, 'reading')}</div>`;
}

import type { DocumentModel } from './document-model';
import { renderBody } from './render-shared';

/** Renders the model as reflowable HTML, styled only by `rendered.css`. */
export function renderRendered(model: DocumentModel): string {
  return `<div class="dr-rendered">${renderBody(model, 'rendered')}</div>`;
}

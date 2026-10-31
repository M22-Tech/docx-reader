import type { ViewMode } from '../config/constants';
import type { OpenError } from '../modules/document/open-error';

/** What the viewer screen knows about the open document's rendering. */
export interface ViewState {
  /** The document this state belongs to. */
  id: string | null;
  /** The mode on screen; null until the first `rendered`. */
  shownMode: ViewMode | null;
  /** The format from the last `rendered` message; null until then. */
  format: string | null;
  otherModeAvailable: boolean;
  /** A mode switch was sent and its `rendered` hasn't come back. */
  switching: boolean;
  error: OpenError | null;
}

export function freshViewState(id: string | null): ViewState {
  return { id, shownMode: null, format: null, otherModeAvailable: false, switching: false, error: null };
}

export function otherMode(mode: ViewMode): ViewMode {
  return mode === 'raw' ? 'rendered' : 'raw';
}

export function canSwitchMode(state: ViewState): boolean {
  return state.shownMode !== null && state.otherModeAvailable && !state.error && !state.switching;
}

/** Source files: Raw shows their text, which reflows like Rendered. */
const SOURCE_FORMATS = ['html'];

/** Whether the text on screen reflows, so the text size buttons apply: Rendered, or Raw of a source file. */
export function textReflows(state: ViewState): boolean {
  if (state.shownMode === 'rendered') return true;
  return state.shownMode === 'raw' && state.format !== null && SOURCE_FORMATS.includes(state.format);
}

/** The icon the mode toggle shows, for the mode it switches to: Rendered, or Raw (a page for documents, code for source files). */
export function toggleIcon(state: ViewState): 'book-open' | 'file-text' | 'code' {
  if (state.shownMode === 'raw') return 'book-open';
  return state.format !== null && SOURCE_FORMATS.includes(state.format) ? 'code' : 'file-text';
}

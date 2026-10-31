import type { ViewMode } from '../config/constants';
import type { OpenError } from '../modules/document/open-error';

/** What the viewer screen knows about the open document's rendering. */
export interface ViewState {
  /** The document this state belongs to. */
  id: string | null;
  /** The mode on screen; null until the first `rendered`. */
  shownMode: ViewMode | null;
  otherModeAvailable: boolean;
  /** A mode switch was sent and its `rendered` hasn't come back. */
  switching: boolean;
  error: OpenError | null;
}

export function freshViewState(id: string | null): ViewState {
  return { id, shownMode: null, otherModeAvailable: false, switching: false, error: null };
}

export function otherMode(mode: ViewMode): ViewMode {
  return mode === 'layout' ? 'reading' : 'layout';
}

export function canSwitchMode(state: ViewState): boolean {
  return state.shownMode !== null && state.otherModeAvailable && !state.error && !state.switching;
}

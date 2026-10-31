import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/** Every code a document can fail to open with (docs/spec/01-opening-files.md, Errors when opening; `timeout` is in 03-viewer.md). */
export type OpenErrorCode =
  | 'too_large'
  | 'empty'
  | 'read_failed'
  | 'unsupported_format'
  | 'encrypted'
  | 'unsupported_version'
  | 'corrupt'
  | 'timeout';

export const OPEN_ERROR_MESSAGES: Record<OpenErrorCode, string> = {
  too_large: 'This document is too large to open on this phone.',
  empty: 'This file is empty.',
  read_failed: "DocX Reader couldn't read this file. Try sharing or opening it again from the app it came from.",
  unsupported_format: "This isn't a document DocX Reader can open. It reads .docx, .doc, .rtf and .odt files.",
  encrypted: "This document is protected with a password. DocX Reader can't open protected documents yet.",
  unsupported_version: "This document was saved in a very old Word format that DocX Reader can't read.",
  corrupt: "This document looks damaged and couldn't be opened.",
  timeout: 'This document took too long to open.',
};

/** The error code of a page `error` message: the page's `internal` shows the `corrupt` message. */
export function codeFromPage(code: OpenErrorCode | 'internal'): OpenErrorCode {
  return code === 'internal' ? 'corrupt' : code;
}

export interface OpenError {
  code: OpenErrorCode;
  fileName: string;
  message: string;
}

export function openError(code: OpenErrorCode, fileName: string): OpenError {
  return { code, fileName, message: OPEN_ERROR_MESSAGES[code] };
}

interface OpenErrorValue {
  error: OpenError | null;
  setError: (error: OpenError) => void;
  clearError: () => void;
}

const OpenErrorContext = createContext<OpenErrorValue | null>(null);

/** Holds the error the home screen shows above "Open file". */
export function OpenErrorProvider({ children }: { children: ReactNode }) {
  const [error, setErrorState] = useState<OpenError | null>(null);
  const setError = useCallback((next: OpenError) => setErrorState(next), []);
  const clearError = useCallback(() => setErrorState(null), []);
  const value = useMemo(() => ({ error, setError, clearError }), [error, setError, clearError]);
  return <OpenErrorContext.Provider value={value}>{children}</OpenErrorContext.Provider>;
}

export function useOpenError(): OpenErrorValue {
  const value = useContext(OpenErrorContext);
  if (!value) throw new Error('useOpenError must be used inside OpenErrorProvider');
  return value;
}

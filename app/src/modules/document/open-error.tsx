import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/** The codes opening a file can fail with before the viewer takes over (docs/spec/01-opening-files.md, Errors when opening). */
export type OpenErrorCode = 'empty' | 'read_failed';

export const OPEN_ERROR_MESSAGES: Record<OpenErrorCode, string> = {
  empty: 'This file is empty.',
  read_failed: "DocX Reader couldn't read this file. Try sharing or opening it again from the app it came from.",
};

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

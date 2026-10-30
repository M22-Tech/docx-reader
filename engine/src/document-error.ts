export type DocumentErrorCode =
  'empty' | 'unsupported_format' | 'encrypted' | 'unsupported_version' | 'corrupt' | 'timeout';

/** An error with a code from the spec's error table, thrown by detection and the parsers. */
export class DocumentError extends Error {
  readonly code: DocumentErrorCode;

  constructor(code: DocumentErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DocumentError';
    this.code = code;
  }
}

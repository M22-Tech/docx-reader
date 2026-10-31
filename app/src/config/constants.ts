// Fixed values of the app (docs/spec/04-look-and-settings.md, Fixed values; docs/spec/03-viewer.md, Reading mode).
// Every other file imports them from here.

export const APP_NAME = 'DocX Reader';

export const LARGE_FILE_WARNING_MB = 30;
export const MAX_RECENT_FILES = 20;
export const RENDER_TIMEOUT_MS = 20_000;

export const THEME_MODES = ['light', 'dark'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export const VIEW_MODES = ['layout', 'reading'] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

export const READING_FONT_STYLES = ['sans', 'serif'] as const;
export type ReadingFontStyle = (typeof READING_FONT_STYLES)[number];

/** The sizes in px that the Smaller and Larger text buttons step through. */
export const READING_TEXT_SIZES = [14, 16, 18, 20, 22, 24, 28, 32] as const;
export type ReadingTextSize = (typeof READING_TEXT_SIZES)[number];

export const DEFAULT_VIEW_MODE: ViewMode = 'layout';
export const DEFAULT_READING_FONT_STYLE: ReadingFontStyle = 'sans';
export const DEFAULT_READING_TEXT_SIZE: ReadingTextSize = 18;
export const DEFAULT_KEEP_RECENT_FILES = true;

export const DOCUMENT_FORMATS = ['docx', 'doc', 'rtf', 'odt', 'html'] as const;
export type DocumentFormat = (typeof DOCUMENT_FORMATS)[number];

/** The MIME types of the supported formats (docs/spec/02-formats.md, Supported formats). app.json lists the same ones for the Android intent filters. */
export const SUPPORTED_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
  'application/vnd.ms-word.document.macroEnabled.12',
  'application/vnd.ms-word.template.macroEnabled.12',
  'application/msword',
  'application/vnd.ms-word',
  'application/rtf',
  'text/rtf',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.text-template',
] as const;

export const SUPPORTED_EXTENSIONS = ['docx', 'docm', 'dotx', 'dotm', 'doc', 'dot', 'rtf', 'odt', 'ott'] as const;

/** Name for a document that arrives without one, and extension for a name without one. */
export const FALLBACK_DOCUMENT_NAME = 'Document';
export const FALLBACK_EXTENSION = 'bin';

/** Characters of a file name shown before it is cut in the middle (the extension always stays). */
export const MAX_SHOWN_NAME_LENGTH = 40;

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

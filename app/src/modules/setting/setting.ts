import { z } from 'zod';
import {
  DEFAULT_KEEP_RECENT_FILES,
  DEFAULT_READING_FONT_STYLE,
  DEFAULT_READING_TEXT_SIZE,
  DEFAULT_VIEW_MODE,
  READING_FONT_STYLES,
  READING_TEXT_SIZES,
  THEME_MODES,
  VIEW_MODES,
} from '../../config/constants';

/** Each field falls back to its default on its own, so one bad value doesn't reset the others. */
export const settingSchema = z.object({
  theme: z.enum(THEME_MODES).optional().catch(undefined),
  defaultMode: z.enum(VIEW_MODES).catch(DEFAULT_VIEW_MODE),
  readingFontStyle: z.enum(READING_FONT_STYLES).catch(DEFAULT_READING_FONT_STYLE),
  readingTextSize: z.literal(READING_TEXT_SIZES).catch(DEFAULT_READING_TEXT_SIZE),
  keepRecentFiles: z.boolean().catch(DEFAULT_KEEP_RECENT_FILES),
});

export type Setting = z.infer<typeof settingSchema>;

/** `theme` is absent until the person picks one. */
export const defaultSetting: Setting = {
  defaultMode: DEFAULT_VIEW_MODE,
  readingFontStyle: DEFAULT_READING_FONT_STYLE,
  readingTextSize: DEFAULT_READING_TEXT_SIZE,
  keepRecentFiles: DEFAULT_KEEP_RECENT_FILES,
};

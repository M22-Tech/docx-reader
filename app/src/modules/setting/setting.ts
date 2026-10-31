import { z } from 'zod';
import {
  DEFAULT_KEEP_RECENT_FILES,
  DEFAULT_FONT_STYLE,
  DEFAULT_TEXT_SIZE,
  DEFAULT_VIEW_MODE,
  FONT_STYLES,
  TEXT_SIZES,
  THEME_MODES,
  VIEW_MODES,
} from '../../config/constants';

/** Each field falls back to its default on its own, so one bad value doesn't reset the others. */
export const settingSchema = z.object({
  theme: z.enum(THEME_MODES).optional().catch(undefined),
  defaultMode: z.enum(VIEW_MODES).catch(DEFAULT_VIEW_MODE),
  fontStyle: z.enum(FONT_STYLES).catch(DEFAULT_FONT_STYLE),
  textSize: z.literal(TEXT_SIZES).catch(DEFAULT_TEXT_SIZE),
  keepRecentFiles: z.boolean().catch(DEFAULT_KEEP_RECENT_FILES),
});

export type Setting = z.infer<typeof settingSchema>;

/** `theme` is absent until the person picks one. */
export const defaultSetting: Setting = {
  defaultMode: DEFAULT_VIEW_MODE,
  fontStyle: DEFAULT_FONT_STYLE,
  textSize: DEFAULT_TEXT_SIZE,
  keepRecentFiles: DEFAULT_KEEP_RECENT_FILES,
};

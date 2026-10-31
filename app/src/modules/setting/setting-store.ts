import { logger } from '../../logger';
import { defaultSetting, settingSchema, type Setting } from './setting';
import { readSetting, writeSetting } from './setting-storage';

/** Turns the stored string into settings; anything missing or invalid becomes the defaults. */
export function parseSetting(raw: string | null): Setting {
  if (raw === null) return defaultSetting;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return defaultSetting;
  }
  const result = settingSchema.safeParse(value);
  return result.success ? result.data : defaultSetting;
}

export async function loadSetting(): Promise<Setting> {
  try {
    return parseSetting(await readSetting());
  } catch (error) {
    logger.warn('reading the settings failed', error);
    return defaultSetting;
  }
}

export async function saveSetting(setting: Setting): Promise<void> {
  await writeSetting(JSON.stringify(setting));
}

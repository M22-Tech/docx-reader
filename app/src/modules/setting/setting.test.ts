import { defaultSetting, settingSchema } from './setting';

describe('settingSchema', () => {
  it('has the documented defaults and no theme', () => {
    expect(defaultSetting).toEqual({
      defaultMode: 'layout',
      readingFontStyle: 'sans',
      readingTextSize: 18,
      keepRecentFiles: true,
    });
    expect(settingSchema.parse({})).toEqual(defaultSetting);
  });

  it('keeps valid values', () => {
    const value = {
      theme: 'dark',
      defaultMode: 'reading',
      readingFontStyle: 'serif',
      readingTextSize: 28,
      keepRecentFiles: false,
    };
    expect(settingSchema.parse(value)).toEqual(value);
  });

  it('replaces an unknown size with the default and keeps the other fields', () => {
    expect(settingSchema.parse({ readingTextSize: 19, defaultMode: 'reading' })).toEqual({
      ...defaultSetting,
      defaultMode: 'reading',
    });
  });

  it('replaces invalid fields on their own', () => {
    const parsed = settingSchema.parse({
      theme: 'system',
      defaultMode: 'pdf',
      readingFontStyle: 3,
      keepRecentFiles: 'yes',
    });
    expect(parsed).toEqual(defaultSetting);
  });
});

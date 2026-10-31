import { defaultSetting, settingSchema } from './setting';

describe('settingSchema', () => {
  it('has the documented defaults and no theme', () => {
    expect(defaultSetting).toEqual({
      defaultMode: 'raw',
      fontStyle: 'sans',
      textSize: 18,
      keepRecentFiles: true,
    });
    expect(settingSchema.parse({})).toEqual(defaultSetting);
  });

  it('keeps valid values', () => {
    const value = {
      theme: 'dark',
      defaultMode: 'rendered',
      fontStyle: 'serif',
      textSize: 28,
      keepRecentFiles: false,
    };
    expect(settingSchema.parse(value)).toEqual(value);
  });

  it('replaces an unknown size with the default and keeps the other fields', () => {
    expect(settingSchema.parse({ textSize: 19, defaultMode: 'rendered' })).toEqual({
      ...defaultSetting,
      defaultMode: 'rendered',
    });
  });

  it('falls back to the defaults for the old mode values and field names', () => {
    const parsed = settingSchema.parse({ defaultMode: 'layout', readingTextSize: 28, readingFontStyle: 'serif' });
    expect(parsed).toEqual(defaultSetting);
  });

  it('replaces invalid fields on their own', () => {
    const parsed = settingSchema.parse({
      theme: 'system',
      defaultMode: 'pdf',
      fontStyle: 3,
      keepRecentFiles: 'yes',
    });
    expect(parsed).toEqual(defaultSetting);
  });
});

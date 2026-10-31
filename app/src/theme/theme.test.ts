import { colors, withAlpha } from './colors';
import { resolveThemeMode } from './theme';

describe('resolveThemeMode', () => {
  it('uses the saved theme over the device setting', () => {
    expect(resolveThemeMode('dark', 'light')).toBe('dark');
    expect(resolveThemeMode('light', 'dark')).toBe('light');
  });

  it('follows the device setting until a theme is saved', () => {
    expect(resolveThemeMode(undefined, 'dark')).toBe('dark');
    expect(resolveThemeMode(undefined, 'light')).toBe('light');
  });

  it('is light when the device has no preference', () => {
    expect(resolveThemeMode(undefined, null)).toBe('light');
    expect(resolveThemeMode(undefined, undefined)).toBe('light');
    expect(resolveThemeMode(undefined, 'unspecified')).toBe('light');
  });
});

describe('colors', () => {
  it('match the spec table', () => {
    expect(colors.light).toEqual({ background: '#FFFFFF', text: '#262626', accent: '#065591', wordmarkX: '#065591' });
    expect(colors.dark).toEqual({ background: '#262626', text: '#FFFFFF', accent: '#1F87D6', wordmarkX: '#1F87D6' });
  });
});

describe('withAlpha', () => {
  it('turns a hex colour into rgba', () => {
    expect(withAlpha('#434343', 0.2)).toBe('rgba(67, 67, 67, 0.2)');
    expect(withAlpha('#1F87D6', 1)).toBe('rgba(31, 135, 214, 1)');
  });
});

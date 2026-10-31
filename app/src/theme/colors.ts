import type { ThemeMode } from '../config/constants';

export interface Colors {
  background: string;
  text: string;
  accent: string;
  wordmarkX: string;
}

// docs/spec/04-look-and-settings.md, Brand.
export const colors: Record<ThemeMode, Colors> = {
  light: { background: '#FFFFFF', text: '#262626', accent: '#065591', wordmarkX: '#065591' },
  dark: { background: '#262626', text: '#FFFFFF', accent: '#1F87D6', wordmarkX: '#1F87D6' },
};

/** A `#rrggbb` colour at the given opacity (0 to 1), as an `rgba()` string. */
export function withAlpha(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

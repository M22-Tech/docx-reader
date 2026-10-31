import type { ThemeMode } from '../config/constants';

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24 } as const;
export const radius = 12;
export const borderWidth = 1.5;
/** Smallest touch target in dp. */
export const minTouchSize = 48;
/** Text sizes in dp; nothing below 16. */
export const textSizes = { body: 16, large: 18, title: 20, heading: 24 } as const;

/** Opacities of the text colour for borders, secondary text and pressed backgrounds. */
export const opacity = { border: 0.2, muted: 0.75, pressed: 0.18, selected: 0.12 } as const;

/** The saved theme wins; until one is saved the device setting applies (light when it has none). */
export function resolveThemeMode(saved: ThemeMode | undefined, device: string | null | undefined): ThemeMode {
  if (saved) return saved;
  return device === 'dark' ? 'dark' : 'light';
}

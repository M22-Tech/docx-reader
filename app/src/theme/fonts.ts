// The family names the expo-font config plugin registers for the bundled Arimo files (the file names without extension).
export const fonts = {
  regular: 'Arimo_400Regular',
  bold: 'Arimo_700Bold',
} as const;

/** The device's own fonts, which Rendered mode uses so every script displays. */
export const deviceFonts = {
  serif: 'serif',
  sans: 'sans-serif',
} as const;

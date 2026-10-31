import * as SystemUI from 'expo-system-ui';
import { StatusBar } from 'expo-status-bar';
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import type { ThemeMode } from '../config/constants';
import { useSetting } from '../modules/setting/use-setting';
import { logger } from '../logger';
import { colors, type Colors } from './colors';
import { resolveThemeMode } from './theme';

interface ThemeValue {
  mode: ThemeMode;
  colors: Colors;
  /** Saves the other mode as the theme. */
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { setting, update } = useSetting();
  const device = useColorScheme();
  const mode = resolveThemeMode(setting.theme, device);
  const palette = colors[mode];

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(palette.background).catch((error: unknown) => {
      logger.warn('setting the system background failed', error);
    });
  }, [palette.background]);

  const toggleMode = useCallback(() => {
    update({ theme: mode === 'dark' ? 'light' : 'dark' });
  }, [mode, update]);

  const value = useMemo(() => ({ mode, colors: palette, toggleMode }), [mode, palette, toggleMode]);

  return (
    <ThemeContext.Provider value={value}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}

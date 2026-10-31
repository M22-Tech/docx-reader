import { ActivityIndicator } from 'react-native';
import { useTheme } from '../../theme/theme-provider';
import { AppText } from './app-text';
import { useReduceMotion } from './use-reduce-motion';

/** The accent spinner; the text "Loading…" instead when the system's reduce-motion setting is on. */
export function Spinner() {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  if (reduceMotion) return <AppText accessibilityRole="progressbar">Loading…</AppText>;
  return <ActivityIndicator size="large" color={colors.accent} accessibilityLabel="Loading" />;
}

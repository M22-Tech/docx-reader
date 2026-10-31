import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from '../../theme/theme';
import { useTheme } from '../../theme/theme-provider';

/** A scrolling column of cards on the theme's background. */
export function Screen({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        gap: spacing.md,
        padding: spacing.md,
        paddingBottom: spacing.md + insets.bottom,
        paddingLeft: spacing.md + insets.left,
        paddingRight: spacing.md + insets.right,
      }}
    >
      {children}
    </ScrollView>
  );
}

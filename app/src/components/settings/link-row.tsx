import { ChevronRight } from 'lucide-react-native';
import { Pressable } from 'react-native';
import { withAlpha } from '../../theme/colors';
import { minTouchSize, opacity, spacing } from '../../theme/theme';
import { useTheme } from '../../theme/theme-provider';
import { AppText } from '../ui/app-text';

/** A plain text row with a chevron, for the last line of a card that opens another screen. */
export function LinkRow({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
        minHeight: minTouchSize,
        backgroundColor: pressed ? withAlpha(colors.accent, opacity.pressed) : 'transparent',
      })}
    >
      <AppText>{label}</AppText>
      <ChevronRight size={24} color={colors.text} strokeWidth={2} />
    </Pressable>
  );
}

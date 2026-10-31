import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { withAlpha } from '../../theme/colors';
import { minTouchSize, opacity, spacing } from '../../theme/theme';
import { useTheme } from '../../theme/theme-provider';
import { AppText } from './app-text';
import { useCardStyle } from './card';

interface PressableCardProps {
  icon: LucideIcon;
  title: string;
  /** One line under the title. */
  description: string;
  onPress: () => void;
}

/** A card that is one button: the whole card is pressable. */
export function PressableCard({ icon: Icon, title, description, onPress }: PressableCardProps) {
  const { colors } = useTheme();
  const cardStyle = useCardStyle();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={description}
      onPress={onPress}
      style={({ pressed }) => [
        cardStyle,
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          minHeight: minTouchSize,
          backgroundColor: pressed ? withAlpha(colors.accent, opacity.pressed) : 'transparent',
        },
      ]}
    >
      <Icon size={28} color={colors.text} strokeWidth={2} />
      <View style={{ flex: 1 }}>
        <AppText variant="title" bold>
          {title}
        </AppText>
        <AppText muted>{description}</AppText>
      </View>
      <ChevronRight size={24} color={colors.text} strokeWidth={2} />
    </Pressable>
  );
}

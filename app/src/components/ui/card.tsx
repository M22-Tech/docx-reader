import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { withAlpha } from '../../theme/colors';
import { borderWidth, opacity, radius, spacing } from '../../theme/theme';
import { useTheme } from '../../theme/theme-provider';
import { AppText } from './app-text';

/** The border, radius and padding shared by Card and PressableCard. */
export function useCardStyle(): ViewStyle {
  const { colors } = useTheme();
  return {
    borderWidth,
    borderColor: withAlpha(colors.text, opacity.border),
    borderRadius: radius,
    padding: spacing.md,
  };
}

interface CardProps {
  title?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function Card({ title, children, style }: CardProps) {
  const cardStyle = useCardStyle();
  return (
    <View style={[cardStyle, { gap: spacing.md }, style]}>
      {title ? (
        <AppText variant="title" bold accessibilityRole="header">
          {title}
        </AppText>
      ) : null}
      {children}
    </View>
  );
}

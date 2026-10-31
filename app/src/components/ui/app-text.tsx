import { Text, type TextProps } from 'react-native';
import { fonts } from '../../theme/fonts';
import { opacity, textSizes } from '../../theme/theme';
import { useTheme } from '../../theme/theme-provider';

interface AppTextProps extends TextProps {
  variant?: keyof typeof textSizes;
  bold?: boolean;
  /** Secondary text: the text colour at a lower opacity. */
  muted?: boolean;
}

export function AppText({ variant = 'body', bold = false, muted = false, style, ...props }: AppTextProps) {
  const { colors } = useTheme();
  return (
    <Text
      allowFontScaling
      {...props}
      style={[
        {
          fontFamily: bold ? fonts.bold : fonts.regular,
          fontSize: textSizes[variant],
          color: colors.text,
          opacity: muted ? opacity.muted : 1,
        },
        style,
      ]}
    />
  );
}

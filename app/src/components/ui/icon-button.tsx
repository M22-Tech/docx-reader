import type { LucideIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { withAlpha } from '../../theme/colors';
import { borderWidth, minTouchSize, opacity, radius, spacing } from '../../theme/theme';
import { useTheme } from '../../theme/theme-provider';
import { AppText } from './app-text';

const LABEL_SHOWN_MS = 2000;

interface IconButtonProps {
  icon: LucideIcon;
  /** What the button does: read by screen readers and shown on long press. */
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
  /** Which edge of the button the long-press label lines up with (it grows the other way). */
  labelAlign?: 'left' | 'right';
}

export function IconButton({
  icon: Icon,
  accessibilityLabel,
  onPress,
  disabled = false,
  labelAlign = 'right',
}: IconButtonProps) {
  const { colors } = useTheme();
  const [labelShown, setLabelShown] = useState(false);

  useEffect(() => {
    if (!labelShown) return;
    const timer = setTimeout(() => setLabelShown(false), LABEL_SHOWN_MS);
    return () => clearTimeout(timer);
  }, [labelShown]);

  return (
    <View style={{ zIndex: labelShown ? 10 : 0 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        onLongPress={() => setLabelShown(true)}
        style={({ pressed }) => ({
          width: minTouchSize,
          height: minTouchSize,
          borderRadius: minTouchSize / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? withAlpha(colors.accent, opacity.pressed) : 'transparent',
          opacity: disabled ? 0.4 : 1,
        })}
      >
        <Icon size={24} color={colors.text} strokeWidth={2} />
      </Pressable>
      {labelShown ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: minTouchSize + spacing.xs,
            width: 240,
            alignItems: labelAlign === 'right' ? 'flex-end' : 'flex-start',
            ...(labelAlign === 'right' ? { right: 0 } : { left: 0 }),
          }}
        >
          <View
            style={{
              backgroundColor: colors.background,
              borderColor: colors.text,
              borderWidth,
              borderRadius: radius,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
            }}
          >
            <AppText>{accessibilityLabel}</AppText>
          </View>
        </View>
      ) : null}
    </View>
  );
}

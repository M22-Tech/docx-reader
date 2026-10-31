import { Check } from 'lucide-react-native';
import { Pressable, View, type TextStyle } from 'react-native';
import { withAlpha } from '../../theme/colors';
import { borderWidth, minTouchSize, opacity, radius, spacing } from '../../theme/theme';
import { useTheme } from '../../theme/theme-provider';
import { AppText } from './app-text';

export interface ToggleOption<T extends string> {
  value: T;
  label: string;
  /** Style of the label, e.g. to preview a font. */
  labelStyle?: TextStyle;
}

interface ToggleProps<T extends string> {
  /** Names the group for screen readers. */
  accessibilityLabel: string;
  options: readonly [ToggleOption<T>, ToggleOption<T>];
  value: T;
  onChange: (value: T) => void;
}

/** A two-choice setting. The selected option has the accent border and a check icon, so colour is not the only cue. */
export function Toggle<T extends string>({ accessibilityLabel, options, value, onChange }: ToggleProps<T>) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={{ flexDirection: 'row', gap: spacing.sm }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => ({
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing.sm,
              minHeight: minTouchSize,
              paddingHorizontal: spacing.sm,
              borderRadius: radius,
              borderWidth,
              borderColor: selected ? colors.accent : withAlpha(colors.text, opacity.border),
              backgroundColor: pressed
                ? withAlpha(colors.accent, opacity.pressed)
                : selected
                  ? withAlpha(colors.accent, opacity.selected)
                  : 'transparent',
            })}
          >
            {selected ? <Check size={20} color={colors.text} strokeWidth={2.5} /> : null}
            <AppText bold={selected} style={option.labelStyle}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

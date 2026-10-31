import type { ReactNode } from 'react';
import { View } from 'react-native';
import { spacing } from '../../theme/theme';
import { AppText } from '../ui/app-text';

/** Text on the left and a control (an icon button) on the right. */
export function SettingRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
      <AppText style={{ flex: 1 }}>{label}</AppText>
      {children}
    </View>
  );
}

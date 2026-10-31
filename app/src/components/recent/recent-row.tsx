import { X } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { withAlpha } from '../../theme/colors';
import { minTouchSize, opacity, spacing } from '../../theme/theme';
import { useTheme } from '../../theme/theme-provider';
import { formatLabel, formatOpened, formatSize } from '../../modules/recent/format-recent';
import type { RecentEntry } from '../../modules/recent/recent';
import { AppText } from '../ui/app-text';
import { FileName } from '../ui/file-name';
import { IconButton } from '../ui/icon-button';

interface RecentRowProps {
  entry: RecentEntry;
  now: number;
  onOpen: () => void;
  onRemove: () => void;
}

/** One recent file: the whole row opens it; the remove button sits at the end. */
export function RecentRow({ entry, now, onOpen, onRemove }: RecentRowProps) {
  const { colors } = useTheme();
  const details = `${formatLabel(entry)} · ${formatSize(entry.sizeBytes)} · ${formatOpened(entry.openedAt, now)}`;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${entry.name}, ${details}`}
        onPress={onOpen}
        style={({ pressed }) => ({
          flex: 1,
          minHeight: minTouchSize,
          justifyContent: 'center',
          borderRadius: 8,
          paddingHorizontal: spacing.sm,
          backgroundColor: pressed ? withAlpha(colors.accent, opacity.pressed) : 'transparent',
        })}
      >
        <FileName name={entry.name} bold />
        <AppText muted numberOfLines={1}>
          {details}
        </AppText>
      </Pressable>
      <IconButton icon={X} accessibilityLabel={`Remove ${entry.name}`} onPress={onRemove} />
    </View>
  );
}

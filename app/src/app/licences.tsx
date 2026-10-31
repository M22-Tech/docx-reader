import { Stack, useRouter } from 'expo-router';
import { ArrowLeft, ChevronRight } from 'lucide-react-native';
import { FlatList, Pressable, View } from 'react-native';
import { AppText } from '../components/ui/app-text';
import { IconButton } from '../components/ui/icon-button';
import { licenceId, licences, type LicenceEntry } from '../licences/licences';
import { withAlpha } from '../theme/colors';
import { borderWidth, minTouchSize, opacity, spacing } from '../theme/theme';
import { useTheme } from '../theme/theme-provider';

function LicenceRow({ entry, onPress }: { entry: LicenceEntry; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${entry.name} ${entry.version}, ${entry.license}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        minHeight: minTouchSize,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        borderBottomWidth: borderWidth,
        borderBottomColor: withAlpha(colors.text, opacity.border),
        backgroundColor: pressed ? withAlpha(colors.accent, opacity.pressed) : 'transparent',
      })}
    >
      <View style={{ flex: 1 }}>
        <AppText bold>{entry.name}</AppText>
        <AppText muted>
          {entry.version} · {entry.license}
        </AppText>
      </View>
      <ChevronRight size={24} color={colors.text} strokeWidth={2} />
    </Pressable>
  );
}

export default function LicencesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Open-source licences',
          headerBackVisible: false,
          headerLeft: () => (
            <IconButton icon={ArrowLeft} accessibilityLabel="Back" labelAlign="left" onPress={() => router.back()} />
          ),
        }}
      />
      <FlatList
        style={{ flex: 1, backgroundColor: colors.background }}
        data={licences}
        keyExtractor={licenceId}
        renderItem={({ item }) => (
          <LicenceRow
            entry={item}
            onPress={() => router.push({ pathname: '/licence', params: { id: licenceId(item) } })}
          />
        )}
        initialNumToRender={20}
      />
    </>
  );
}

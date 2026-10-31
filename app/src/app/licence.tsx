import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { ScrollView } from 'react-native';
import { AppText } from '../components/ui/app-text';
import { IconButton } from '../components/ui/icon-button';
import { findLicence } from '../licences/licences';
import { spacing } from '../theme/theme';
import { useTheme } from '../theme/theme-provider';

export default function LicenceScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const entry = id ? findLicence(id) : undefined;
  return (
    <>
      <Stack.Screen
        options={{
          title: entry ? entry.name : 'Licence',
          headerBackVisible: false,
          headerLeft: () => (
            <IconButton icon={ArrowLeft} accessibilityLabel="Back" labelAlign="left" onPress={() => router.back()} />
          ),
        }}
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
      >
        {entry ? (
          <>
            <AppText muted>
              {entry.name} {entry.version} · {entry.license}
            </AppText>
            <AppText selectable>
              {entry.text ?? 'This package ships no licence text. Its licence is named above.'}
            </AppText>
          </>
        ) : (
          <AppText>This licence was not found.</AppText>
        )}
      </ScrollView>
    </>
  );
}

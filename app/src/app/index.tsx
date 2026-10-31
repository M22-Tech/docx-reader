import { FolderOpen, Settings } from 'lucide-react-native';
import { Stack, useRouter } from 'expo-router';
import { View } from 'react-native';
import { AppText } from '../components/ui/app-text';
import { Card } from '../components/ui/card';
import { IconButton } from '../components/ui/icon-button';
import { PressableCard } from '../components/ui/pressable-card';
import { Screen } from '../components/ui/screen';
import { ThemeToggleButton } from '../components/theme-toggle-button';
import { Wordmark } from '../components/wordmark';

const WORDMARK_HEIGHT = 28;

export default function HomeScreen() {
  const router = useRouter();
  return (
    <>
      <Stack.Screen
        options={{
          headerLeft: () => <Wordmark height={WORDMARK_HEIGHT} />,
          headerRight: () => (
            <View style={{ flexDirection: 'row' }}>
              <ThemeToggleButton />
              <IconButton icon={Settings} accessibilityLabel="Settings" onPress={() => router.push('/settings')} />
            </View>
          ),
        }}
      />
      <Screen>
        <PressableCard
          icon={FolderOpen}
          title="Open file"
          description="Pick a document from your phone"
          onPress={() => {
            // Opening a file is wired in task 12.
          }}
        />
        <Card title="Recent files">
          <AppText muted>Documents you open will appear here.</AppText>
        </Card>
      </Screen>
    </>
  );
}

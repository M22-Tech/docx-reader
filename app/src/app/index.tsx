import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { FolderOpen, Settings } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { RecentRow } from '../components/recent/recent-row';
import { OpenErrorCard } from '../components/open-error-card';
import { AppText } from '../components/ui/app-text';
import { Card } from '../components/ui/card';
import { IconButton } from '../components/ui/icon-button';
import { PressableCard } from '../components/ui/pressable-card';
import { Screen } from '../components/ui/screen';
import { Spinner } from '../components/ui/spinner';
import { Wordmark } from '../components/wordmark';
import { logger } from '../logger';
import { pickDocument } from '../modules/document/document-picker';
import { openDocument } from '../modules/document/open-document';
import { useOpenError } from '../modules/document/open-error';
import { useRecent } from '../modules/recent/use-recent';
import { useSetting } from '../modules/setting/use-setting';

const WORDMARK_HEIGHT = 28;

export default function HomeScreen() {
  const router = useRouter();
  const { setting } = useSetting();
  const { entries, remove } = useRecent();
  const { error, setError, clearError } = useOpenError();
  const [opening, setOpening] = useState(false);
  // "Today" and "Yesterday" are worked out against the time the screen was last shown.
  const [now, setNow] = useState(() => Date.now());
  useFocusEffect(
    useCallback(() => {
      setNow(Date.now());
    }, []),
  );

  const openFile = useCallback(async () => {
    if (opening) return;
    setOpening(true);
    try {
      const picked = await pickDocument();
      if (!picked) return;
      const result = await openDocument(picked, setting.keepRecentFiles);
      if (result.ok) router.push({ pathname: '/viewer', params: { id: result.document.id } });
      else setError(result.error);
    } catch (pickError) {
      logger.warn('picking a file failed', pickError);
    } finally {
      setOpening(false);
    }
  }, [opening, router, setError, setting.keepRecentFiles]);

  return (
    <>
      <Stack.Screen
        options={{
          headerLeft: () => <Wordmark height={WORDMARK_HEIGHT} />,
          headerRight: () => (
            <IconButton icon={Settings} accessibilityLabel="Settings" onPress={() => router.push('/settings')} />
          ),
        }}
      />
      <Screen>
        {error ? <OpenErrorCard error={error} onDismiss={clearError} /> : null}
        {opening ? <Spinner /> : null}
        <PressableCard
          icon={FolderOpen}
          title="Open file"
          description="Pick a document from your phone"
          onPress={() => void openFile()}
        />
        <Card title="Recent files">
          {entries.length === 0 ? (
            <AppText muted>Documents you open will appear here.</AppText>
          ) : (
            entries.map((entry) => (
              <RecentRow
                key={entry.id}
                entry={entry}
                now={now}
                onOpen={() => router.push({ pathname: '/viewer', params: { id: entry.id } })}
                onRemove={() => void remove(entry.id)}
              />
            ))
          )}
        </Card>
      </Screen>
    </>
  );
}

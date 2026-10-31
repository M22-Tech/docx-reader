import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { BackHandler } from 'react-native';
import { AppText } from '../components/ui/app-text';
import { Card } from '../components/ui/card';
import { FileName } from '../components/ui/file-name';
import { IconButton } from '../components/ui/icon-button';
import { Screen } from '../components/ui/screen';
import { Spinner } from '../components/ui/spinner';
import { FALLBACK_DOCUMENT_NAME } from '../config/constants';
import { findUnkept, type OpenedDocument } from '../modules/document/document';
import { openDocument } from '../modules/document/open-document';
import { openError, useOpenError } from '../modules/document/open-error';
import { formatSize } from '../modules/recent/format-recent';
import { loadRecent } from '../modules/recent/recent-store';
import { useSetting } from '../modules/setting/use-setting';

/** Placeholder viewer: the header and the document's name and size. The web view comes in task 13. */
export default function ViewerScreen() {
  const router = useRouter();
  const { source, name, id } = useLocalSearchParams<{ source?: string; name?: string; id?: string }>();
  const { setting } = useSetting();
  const { setError, clearError } = useOpenError();
  const key = `${source ?? ''}|${name ?? ''}|${id ?? ''}`;
  const [loaded, setLoaded] = useState<{ key: string; document: OpenedDocument } | null>(null);
  // A document opened for an earlier source or id is not shown for the current one.
  const document = loaded?.key === key ? loaded.document : null;

  const goHome = useCallback(() => router.dismissTo('/'), [router]);

  // Back, by button or gesture, always returns to the home screen, not to a document opened before.
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        goHome();
        return true;
      });
      return () => subscription.remove();
    }, [goHome]),
  );

  useEffect(() => {
    let active = true;
    clearError();

    async function load(): Promise<OpenedDocument | null> {
      if (source) {
        const result = await openDocument({ uri: source, name }, setting.keepRecentFiles);
        if (result.ok) return result.document;
        setError(result.error);
        return null;
      }
      if (id) {
        const entry = (await loadRecent()).find((item) => item.id === id);
        const found = entry
          ? { id: entry.id, name: entry.name, sizeBytes: entry.sizeBytes, path: entry.path }
          : findUnkept(id);
        if (found) return found;
      }
      setError(openError('read_failed', FALLBACK_DOCUMENT_NAME));
      return null;
    }

    void load().then((result) => {
      if (!active) return;
      if (result) setLoaded({ key, document: result });
      else goHome();
    });
    return () => {
      active = false;
    };
    // The keep-recent setting only matters at the moment a source is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, name, id]);

  return (
    <>
      <Stack.Screen
        options={{
          headerBackVisible: false,
          headerLeft: () => (
            <IconButton icon={ArrowLeft} accessibilityLabel="Back" labelAlign="left" onPress={goHome} />
          ),
          headerTitle: () => (document ? <FileName name={document.name} bold /> : null),
        }}
      />
      <Screen>
        {document ? (
          <Card>
            <FileName name={document.name} bold />
            <AppText muted>{formatSize(document.sizeBytes)}</AppText>
          </Card>
        ) : (
          <Spinner />
        )}
      </Screen>
    </>
  );
}

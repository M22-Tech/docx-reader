import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { AArrowDown, AArrowUp, ArrowLeft, BookOpen, FileText } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, Linking, View } from 'react-native';
import { OpenErrorCard } from '../components/open-error-card';
import { AppText } from '../components/ui/app-text';
import { FileName } from '../components/ui/file-name';
import { IconButton } from '../components/ui/icon-button';
import { Screen } from '../components/ui/screen';
import { Spinner } from '../components/ui/spinner';
import { FALLBACK_DOCUMENT_NAME } from '../config/constants';
import { findUnkept, type OpenedDocument } from '../modules/document/document';
import { readBase64 } from '../modules/document/document-files';
import { openDocument, releaseDocument } from '../modules/document/open-document';
import { codeFromPage, openError, useOpenError, type OpenErrorCode } from '../modules/document/open-error';
import { loadRecent, setRecentFormat } from '../modules/recent/recent-store';
import { canStepTextSize, stepTextSize } from '../modules/setting/reading-text-size';
import { useSetting } from '../modules/setting/use-setting';
import { logger } from '../logger';
import { spacing } from '../theme/theme';
import { useTheme } from '../theme/theme-provider';
import { BridgeClient } from '../viewer/bridge-client';
import { largeFileLine, looksLikeOutOfMemory } from '../viewer/large-file';
import { openableLink } from '../viewer/link';
import { canSwitchMode, freshViewState, otherMode, type ViewState } from '../viewer/view-state';
import { ViewerWebView, type ViewerWebViewHandle } from '../viewer/viewer-web-view';

function askToOpenLink(href: string): void {
  const address = openableLink(href);
  if (!address) {
    logger.debug('dropped a link with a scheme that is not allowed');
    return;
  }
  Alert.alert('Open this link in your browser?', address, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Open',
      onPress: () => {
        Linking.openURL(address).catch((error: unknown) => logger.warn('opening a link failed', error));
      },
    },
  ]);
}

export default function ViewerScreen() {
  const router = useRouter();
  const { source, name, id } = useLocalSearchParams<{ source?: string; name?: string; id?: string }>();
  const { setting, update } = useSetting();
  const { mode: themeMode, colors } = useTheme();
  const { setError, clearError } = useOpenError();
  const key = `${source ?? ''}|${name ?? ''}|${id ?? ''}`;
  const [loaded, setLoaded] = useState<{ key: string; document: OpenedDocument } | null>(null);
  // A document opened for an earlier source or id is not shown for the current one.
  const document = loaded?.key === key ? loaded.document : null;
  const [state, setState] = useState<ViewState>(freshViewState(null));
  const view = state.id === (document?.id ?? null) ? state : freshViewState(document?.id ?? null);
  const webView = useRef<ViewerWebViewHandle>(null);
  // The default mode only matters at the moment the document opens.
  const defaultMode = useRef(setting.defaultMode);
  useEffect(() => {
    defaultMode.current = setting.defaultMode;
  }, [setting.defaultMode]);

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

  const settingsInput = useMemo(
    () => ({
      theme: themeMode,
      readingTextSize: setting.readingTextSize,
      readingFontStyle: setting.readingFontStyle,
      colors: { ink: colors.text, paper: colors.background },
    }),
    [themeMode, setting.readingTextSize, setting.readingFontStyle, colors.text, colors.background],
  );
  const fail = useCallback((documentId: string, fileName: string, code: OpenErrorCode) => {
    // The error card replaces the web view, which unmounts it so it isn't reused.
    setState((current) => ({
      ...(current.id === documentId ? current : freshViewState(documentId)),
      switching: false,
      error: openError(code, fileName),
    }));
  }, []);

  // One bridge client per opened document, made in the same commit that mounts the web view, so `ready` can't be missed.
  const client = useRef<BridgeClient | null>(null);
  const settingsInputRef = useRef(settingsInput);

  useEffect(() => {
    settingsInputRef.current = settingsInput;
    client.current?.setSettings(settingsInput);
  }, [settingsInput]);

  useEffect(() => {
    if (!document) return;
    const bridge = new BridgeClient(
      (json) => webView.current?.postMessage(json),
      {
        onRendered: (message) => {
          logger.debug('rendered', {
            format: message.format,
            mode: message.mode,
            durationMs: Number(message.durationMs.toFixed(3)),
          });
          setState((current) => ({
            ...(current.id === document.id ? current : freshViewState(document.id)),
            shownMode: message.mode,
            otherModeAvailable: message.otherModeAvailable,
            switching: false,
          }));
          setRecentFormat(document.id, message.format).catch((error: unknown) =>
            logger.warn('saving the format failed', error),
          );
        },
        onError: (message) => fail(document.id, document.name, codeFromPage(message.code)),
        onOpenLink: askToOpenLink,
        onTimeout: () => fail(document.id, document.name, 'timeout'),
        onReadFailed: (error) => {
          logger.warn('reading the copy failed', error);
          fail(document.id, document.name, looksLikeOutOfMemory(error) ? 'too_large' : 'read_failed');
        },
      },
      settingsInputRef.current,
    );
    client.current = bridge;
    bridge.open({ name: document.name, mode: defaultMode.current, readBase64: () => readBase64(document.path) });
    return () => {
      bridge.close();
      client.current = null;
      releaseDocument(document);
    };
  }, [document, fail]);

  const switchMode = useCallback(() => {
    if (!view.shownMode) return;
    setState({ ...view, switching: true });
    client.current?.setMode(otherMode(view.shownMode));
  }, [view]);

  const stepText = useCallback(
    (step: 'smaller' | 'larger') => update({ readingTextSize: stepTextSize(setting.readingTextSize, step) }),
    [setting.readingTextSize, update],
  );

  const showReadingControls = view.shownMode === 'reading' && !view.error;
  const showToggle = canSwitchMode(view) || (view.switching && !view.error);
  const loading = Boolean(document) && !view.shownMode && !view.error;
  const largeLine = document && loading ? largeFileLine(document.sizeBytes) : null;

  return (
    <>
      <Stack.Screen
        options={{
          headerBackVisible: false,
          headerLeft: () => (
            <IconButton icon={ArrowLeft} accessibilityLabel="Back" labelAlign="left" onPress={goHome} />
          ),
          headerTitle: () => (document ? <FileName name={document.name} bold /> : null),
          headerRight: () => (
            <View style={{ flexDirection: 'row' }}>
              {showReadingControls ? (
                <>
                  <IconButton
                    icon={AArrowDown}
                    accessibilityLabel="Smaller text"
                    disabled={!canStepTextSize(setting.readingTextSize, 'smaller')}
                    onPress={() => stepText('smaller')}
                  />
                  <IconButton
                    icon={AArrowUp}
                    accessibilityLabel="Larger text"
                    disabled={!canStepTextSize(setting.readingTextSize, 'larger')}
                    onPress={() => stepText('larger')}
                  />
                </>
              ) : null}
              {showToggle && view.shownMode ? (
                <IconButton
                  icon={view.shownMode === 'layout' ? BookOpen : FileText}
                  accessibilityLabel={view.shownMode === 'layout' ? 'Switch to Reading mode' : 'Switch to Layout mode'}
                  disabled={view.switching}
                  onPress={switchMode}
                />
              ) : null}
            </View>
          ),
        }}
      />
      {view.error ? (
        <Screen>
          <OpenErrorCard error={view.error} />
        </Screen>
      ) : (
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          {document ? (
            <ViewerWebView
              ref={webView}
              backgroundColor={colors.background}
              onMessage={(raw) => client.current?.receive(raw)}
              onProcessGone={() => fail(document.id, document.name, 'too_large')}
            />
          ) : null}
          {loading || !document ? (
            <View
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                alignItems: 'center',
                justifyContent: 'center',
                gap: spacing.md,
                padding: spacing.md,
                backgroundColor: colors.background,
              }}
            >
              <Spinner />
              {largeLine ? <AppText muted>{largeLine}</AppText> : null}
            </View>
          ) : null}
        </View>
      )}
    </>
  );
}

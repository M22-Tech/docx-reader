import { useRouter, useRootNavigationState } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';
import { useEffect } from 'react';
import { logger } from '../../logger';
import { useSetting } from '../setting/use-setting';
import { addToRecent } from './open-document';

/**
 * Handles a share: the other files are copied into recent files, then the first opens in the viewer
 * (so it ends up on top). The share intent is reset once handled.
 */
export function useShareIntentOpen(): void {
  const router = useRouter();
  const navigationReady = Boolean(useRootNavigationState()?.key);
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const { setting } = useSetting();

  useEffect(() => {
    if (!hasShareIntent || !navigationReady) return;
    const files = shareIntent.files ?? [];
    resetShareIntent();
    const [first, ...others] = files;
    if (!first) return;
    void addToRecent(
      others.map((file) => ({ uri: file.path, name: file.fileName })),
      setting.keepRecentFiles,
    )
      .catch((error: unknown) => logger.warn('adding shared files failed', error))
      .then(() => {
        router.push({ pathname: '/viewer', params: { source: first.path, name: first.fileName ?? '' } });
      });
  }, [hasShareIntent, navigationReady, shareIntent, resetShareIntent, router, setting.keepRecentFiles]);
}

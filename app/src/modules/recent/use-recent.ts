import { useCallback, useEffect, useState } from 'react';
import { logger } from '../../logger';
import type { RecentEntry } from './recent';
import { clearRecent, loadRecent, removeRecent, subscribeRecent } from './recent-store';

interface RecentValue {
  entries: RecentEntry[];
  /** False until the list is first read. */
  ready: boolean;
  remove: (id: string) => Promise<void>;
  clear: () => Promise<void>;
}

/** The recent list, kept up to date when any part of the app changes it. */
export function useRecent(): RecentValue {
  const [entries, setEntries] = useState<RecentEntry[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeRecent((next) => {
      if (active) setEntries(next);
    });
    loadRecent()
      .then((loaded) => {
        if (!active) return;
        setEntries(loaded);
        setReady(true);
      })
      .catch((error: unknown) => {
        logger.warn('loading the recent files failed', error);
        if (active) setReady(true);
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const remove = useCallback((id: string) => removeRecent(id), []);
  const clear = useCallback(() => clearRecent(), []);
  return { entries, ready, remove, clear };
}

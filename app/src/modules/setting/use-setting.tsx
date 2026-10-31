import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { logger } from '../../logger';
import { defaultSetting, type Setting } from './setting';
import { loadSetting, saveSetting } from './setting-store';

interface SettingValue {
  setting: Setting;
  /** False until the saved settings are read; the defaults show meanwhile. */
  ready: boolean;
  /** Applies the change at once and saves it. */
  update: (patch: Partial<Setting>) => void;
}

const SettingContext = createContext<SettingValue | null>(null);

export function SettingProvider({ children }: { children: ReactNode }) {
  const [setting, setSetting] = useState<Setting>(defaultSetting);
  const [ready, setReady] = useState(false);
  const latest = useRef(setting);
  // Writes run one after another so a slow earlier write can't overwrite a later one.
  const writes = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let active = true;
    void loadSetting().then((loaded) => {
      if (!active) return;
      latest.current = loaded;
      setSetting(loaded);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const update = useCallback((patch: Partial<Setting>) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setSetting(next);
    writes.current = writes.current
      .then(() => saveSetting(next))
      .catch((error: unknown) => {
        logger.warn('saving the settings failed', error);
      });
  }, []);

  const value = useMemo(() => ({ setting, ready, update }), [setting, ready, update]);

  return <SettingContext.Provider value={value}>{children}</SettingContext.Provider>;
}

export function useSetting(): SettingValue {
  const value = useContext(SettingContext);
  if (!value) throw new Error('useSetting must be used inside SettingProvider');
  return value;
}

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'setting';

/** The only file that touches the storage library: reads and writes the settings as one JSON string. */
export function readSetting(): Promise<string | null> {
  return AsyncStorage.getItem(KEY);
}

export function writeSetting(json: string): Promise<void> {
  return AsyncStorage.setItem(KEY, json);
}

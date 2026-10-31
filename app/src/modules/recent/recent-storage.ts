import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'recent';

/** The only file that touches the storage library: reads and writes the recent list as one JSON string. */
export function readRecent(): Promise<string | null> {
  return AsyncStorage.getItem(KEY);
}

export function writeRecent(json: string): Promise<void> {
  return AsyncStorage.setItem(KEY, json);
}

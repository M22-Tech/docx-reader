import { readRecentListFile, writeRecentListFile } from '../document/document-files';

/** Reads and writes the recent list as one JSON string in a file next to the copies; null when there is no file yet. */
export function readRecent(): Promise<string | null> {
  return readRecentListFile();
}

export function writeRecent(json: string): Promise<void> {
  return writeRecentListFile(json);
}

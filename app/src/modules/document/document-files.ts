import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

/** `recent` keeps copies of recent files; `open` holds the copy of a document opened with recent files off. */
export type CopyFolder = 'recent' | 'open';

/** The recent list sits in the `recent` folder beside the copies; it is not a copy itself. */
const RECENT_LIST_FILE = 'recent.json';
const RECENT_LIST_TEMP_FILE = 'recent.json.tmp';

const ID_LENGTH = 10;
const BASE36 = '0123456789abcdefghijklmnopqrstuvwxyz';

/** The only file that touches the file system and crypto libraries. */

/** 10 random base36 characters. */
export function newId(): string {
  const bytes = Crypto.getRandomBytes(ID_LENGTH);
  return Array.from(bytes, (byte) => BASE36[byte % BASE36.length]).join('');
}

/** The size of a source file when it can be told (null when not) and the name its URI ends in. */
export function sourceInfo(uri: string): { sizeBytes: number | null; displayName: string | null } {
  const file = new File(uri);
  let sizeBytes: number | null = null;
  try {
    const info = file.info();
    sizeBytes = info.exists && typeof info.size === 'number' ? info.size : null;
  } catch {
    sizeBytes = null;
  }
  let displayName: string | null = null;
  try {
    displayName = decodeURIComponent(file.name) || null;
  } catch {
    displayName = file.name || null;
  }
  return { sizeBytes, displayName };
}

function folderOf(folder: CopyFolder): Directory {
  return folder === 'recent' ? new Directory(Paths.document, 'recent') : new Directory(Paths.cache, 'open');
}

/** Copies the source into the app's own storage and returns the copy's URI and size. */
export async function copyToStore(
  sourceUri: string,
  folder: CopyFolder,
  fileName: string,
): Promise<{ uri: string; sizeBytes: number }> {
  const directory = folderOf(folder);
  directory.create({ intermediates: true, idempotent: true });
  const destination = new File(directory, fileName);
  await new File(sourceUri).copy(destination);
  return { uri: destination.uri, sizeBytes: destination.size };
}

/** SHA-256 of the file's bytes as lowercase hex. */
export async function sha256Of(uri: string): Promise<string> {
  const bytes = await new File(uri).bytes();
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function fileExists(uri: string): boolean {
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

/** Deletes a file; a file that is already gone is fine. */
export function deleteFile(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Nothing more to do: the copy is unreachable or gone.
  }
}

/** The file's bytes as base64. */
export async function readBase64(uri: string): Promise<string> {
  return new File(uri).base64();
}

/** Deletes everything in the cache `open` folder: what a killed app left behind. */
export function clearOpenFolder(): void {
  try {
    const directory = folderOf('open');
    if (directory.exists) directory.delete();
  } catch {
    // Nothing more to do: the folder is unreachable or gone.
  }
}

/** The text of the recent list file, or null when there is none yet. */
export async function readRecentListFile(): Promise<string | null> {
  const file = new File(folderOf('recent'), RECENT_LIST_FILE);
  return file.exists ? file.text() : null;
}

/**
 * Replaces the recent list file. The text goes to a temporary file in the same folder and is then moved over
 * the old file, so a crash leaves either the old list or the new one, never half of one.
 */
export async function writeRecentListFile(text: string): Promise<void> {
  const directory = folderOf('recent');
  directory.create({ intermediates: true, idempotent: true });
  const temporary = new File(directory, RECENT_LIST_TEMP_FILE);
  await temporary.write(text);
  await temporary.move(new File(directory, RECENT_LIST_FILE), { overwrite: true });
}

import { MAX_RECENT_FILES } from '../../config/constants';
import { logger } from '../../logger';
import { deleteFile, fileExists } from '../document/document-files';
import { recentEntrySchema, type RecentEntry } from './recent';
import { readRecent, writeRecent } from './recent-storage';

/** Turns the stored string into entries; anything invalid is dropped. */
export function parseRecent(raw: string | null): RecentEntry[] {
  if (raw === null) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  const entries: RecentEntry[] = [];
  for (const item of value) {
    const result = recentEntrySchema.safeParse(item);
    if (result.success) entries.push(result.data);
  }
  return entries;
}

type Listener = (entries: RecentEntry[]) => void;
const listeners = new Set<Listener>();

/** Calls the listener with the new list after every change; returns the way to stop. */
export function subscribeRecent(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Changes run one after another, so two opens at once can't overwrite each other's list.
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

/** Reads the list and drops the entries whose copy is gone. */
async function read(): Promise<{ entries: RecentEntry[]; changed: boolean }> {
  let raw: string | null = null;
  try {
    raw = await readRecent();
  } catch (error) {
    logger.warn('reading the recent files failed', error);
  }
  const parsed = parseRecent(raw);
  const entries = parsed.filter((entry) => fileExists(entry.path));
  return { entries, changed: entries.length !== parsed.length };
}

async function commit(entries: RecentEntry[]): Promise<void> {
  await writeRecent(JSON.stringify(entries));
  for (const listener of listeners) listener(entries);
}

export function loadRecent(): Promise<RecentEntry[]> {
  return enqueue(async () => {
    const { entries, changed } = await read();
    if (changed) await commit(entries);
    return entries;
  });
}

/**
 * Puts a new entry at the top and returns the entry that now stands for the document: the existing one
 * when the same name and contents are already listed (its new copy is deleted), else the new one.
 * Entries beyond the limit are removed with their copies.
 */
export function addRecent(entry: RecentEntry): Promise<RecentEntry> {
  return enqueue(async () => {
    const { entries } = await read();
    const existing = entries.find((item) => item.name === entry.name && item.sha256 === entry.sha256);
    let kept = entry;
    let rest = entries;
    if (existing) {
      if (existing.path !== entry.path) deleteFile(entry.path);
      kept = { ...existing, openedAt: entry.openedAt };
      rest = entries.filter((item) => item.id !== existing.id);
    }
    const next = [kept, ...rest];
    for (const dropped of next.slice(MAX_RECENT_FILES)) deleteFile(dropped.path);
    await commit(next.slice(0, MAX_RECENT_FILES));
    return kept;
  });
}

export function removeRecent(id: string): Promise<void> {
  return enqueue(async () => {
    const { entries } = await read();
    const target = entries.find((item) => item.id === id);
    if (target) deleteFile(target.path);
    await commit(entries.filter((item) => item.id !== id));
  });
}

/** Sets the format an opened document turned out to have (task 13 calls this from the `rendered` message). */
export function setRecentFormat(id: string, format: NonNullable<RecentEntry['format']>): Promise<void> {
  return enqueue(async () => {
    const { entries } = await read();
    if (!entries.some((item) => item.id === id)) return;
    await commit(entries.map((item) => (item.id === id ? { ...item, format } : item)));
  });
}

export function clearRecent(): Promise<void> {
  return enqueue(async () => {
    const { entries } = await read();
    for (const entry of entries) deleteFile(entry.path);
    await commit([]);
  });
}

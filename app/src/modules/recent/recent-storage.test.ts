import type { RecentEntry } from './recent';
import { readRecent, writeRecent } from './recent-storage';
import { addRecent, clearRecent, loadRecent, removeRecent } from './recent-store';

// An in-memory file system under the real file adapter (document-files.ts).
const mockFiles = new Map<string, string>();
const mockLog: string[] = [];
let mockFailMove = false;

jest.mock('expo-crypto', () => ({}));
jest.mock('expo-file-system', () => {
  const join = (parts: unknown[]) =>
    parts
      .map((part) => (typeof part === 'string' ? part : (part as { uri: string }).uri))
      .map((part) => part.replace(/\/+$/, ''))
      .join('/');
  class Directory {
    uri: string;
    exists = true;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    create() {}
    delete() {}
  }
  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    async text() {
      return mockFiles.get(this.uri) ?? '';
    }
    async write(text: string) {
      mockLog.push(`write ${this.uri}`);
      mockFiles.set(this.uri, text);
    }
    async move(destination: File) {
      mockLog.push(`move ${this.uri} -> ${destination.uri}`);
      if (mockFailMove) throw new Error('crash');
      mockFiles.set(destination.uri, mockFiles.get(this.uri) ?? '');
      mockFiles.delete(this.uri);
    }
    delete() {
      mockLog.push(`delete ${this.uri}`);
      mockFiles.delete(this.uri);
    }
  }
  return { Directory, File, Paths: { document: new Directory('file:///data'), cache: new Directory('file:///cache') } };
});

const LIST = 'file:///data/recent/recent.json';
const TEMP = 'file:///data/recent/recent.json.tmp';

function entry(id: string): RecentEntry {
  return {
    id,
    name: `${id}.docx`,
    sizeBytes: 10,
    sha256: `sha-${id}`,
    openedAt: 1,
    path: `file:///data/recent/${id}.docx`,
  };
}

beforeEach(() => {
  mockFiles.clear();
  mockLog.length = 0;
  mockFailMove = false;
});

describe('recent storage on the file adapter', () => {
  it('gives null when there is no file yet', async () => {
    expect(await readRecent()).toBeNull();
  });

  it('round-trips the text', async () => {
    await writeRecent('[{"a":1}]');
    expect(mockFiles.get(LIST)).toBe('[{"a":1}]');
    expect(await readRecent()).toBe('[{"a":1}]');
  });

  it('writes a temporary file in the same folder and moves it over the list', async () => {
    await writeRecent('one');
    await writeRecent('two');
    expect(mockLog).toEqual([`write ${TEMP}`, `move ${TEMP} -> ${LIST}`, `write ${TEMP}`, `move ${TEMP} -> ${LIST}`]);
    expect(mockFiles.has(TEMP)).toBe(false);
  });

  it('keeps the old list when the move fails', async () => {
    await writeRecent('old');
    mockFailMove = true;
    await expect(writeRecent('new')).rejects.toThrow('crash');
    expect(await readRecent()).toBe('old');
  });
});

describe('recent.json is not a copy', () => {
  it('survives removing, clearing and the missing-copy cleanup', async () => {
    mockFiles.set(entry('a').path, 'copy a');
    mockFiles.set(entry('b').path, 'copy b');
    await addRecent(entry('a'));
    await addRecent(entry('b'));
    expect(mockFiles.has(LIST)).toBe(true);

    mockFiles.delete(entry('a').path);
    expect((await loadRecent()).map((item) => item.id)).toEqual(['b']);
    expect(mockFiles.has(LIST)).toBe(true);

    await removeRecent('b');
    expect(mockFiles.has(entry('b').path)).toBe(false);
    expect(mockFiles.has(LIST)).toBe(true);

    mockFiles.set(entry('c').path, 'copy c');
    await addRecent(entry('c'));
    await clearRecent();
    expect(mockFiles.has(entry('c').path)).toBe(false);
    expect(mockFiles.has(LIST)).toBe(true);
    expect(await loadRecent()).toEqual([]);
    expect(mockLog.filter((line) => line.startsWith('delete') && line.includes('recent.json'))).toEqual([]);
  });
});

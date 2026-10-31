import { MAX_RECENT_FILES } from '../../config/constants';
import { deleteFile, fileExists } from '../document/document-files';
import type { RecentEntry } from './recent';
import { addRecent, clearRecent, loadRecent, parseRecent, removeRecent, setRecentFormat } from './recent-store';
import { readRecent, writeRecent } from './recent-storage';

jest.mock('../document/document-files', () => ({ deleteFile: jest.fn(), fileExists: jest.fn() }));
jest.mock('./recent-storage', () => ({ readRecent: jest.fn(), writeRecent: jest.fn() }));

const mockRead = jest.mocked(readRecent);
const mockWrite = jest.mocked(writeRecent);
const mockExists = jest.mocked(fileExists);
const mockDelete = jest.mocked(deleteFile);

let stored: string | null;

function entry(id: string, overrides: Partial<RecentEntry> = {}): RecentEntry {
  return {
    id,
    name: `${id}.docx`,
    sizeBytes: 100,
    sha256: `sha-${id}`,
    openedAt: 1000,
    path: `file:///recent/${id}.docx`,
    ...overrides,
  };
}

function savedIds(): string[] {
  return parseRecent(stored).map((item) => item.id);
}

beforeEach(() => {
  jest.resetAllMocks();
  stored = null;
  mockRead.mockImplementation(async () => stored);
  mockWrite.mockImplementation(async (json) => {
    stored = json;
  });
  mockExists.mockReturnValue(true);
});

describe('parseRecent', () => {
  it('is empty for nothing, bad JSON or a non-array', () => {
    expect(parseRecent(null)).toEqual([]);
    expect(parseRecent('{nope')).toEqual([]);
    expect(parseRecent('{"id":"a"}')).toEqual([]);
  });

  it('drops invalid entries and keeps the rest', () => {
    const good = entry('a');
    expect(parseRecent(JSON.stringify([good, { id: 'b' }, 7]))).toEqual([good]);
  });

  it('ignores an unknown format instead of dropping the entry', () => {
    expect(parseRecent(JSON.stringify([{ ...entry('a'), format: 'pdf' }]))[0]?.format).toBeUndefined();
  });
});

describe('addRecent', () => {
  it('puts the newest first', async () => {
    await addRecent(entry('a'));
    await addRecent(entry('b'));
    expect(savedIds()).toEqual(['b', 'a']);
  });

  it('moves the same name and hash to the top and deletes the new copy', async () => {
    await addRecent(entry('a', { name: 'Report.docx', sha256: 'same', openedAt: 1 }));
    await addRecent(entry('b'));
    const kept = await addRecent(entry('c', { name: 'Report.docx', sha256: 'same', openedAt: 5000 }));
    expect(kept.id).toBe('a');
    expect(kept.openedAt).toBe(5000);
    expect(savedIds()).toEqual(['a', 'b']);
    expect(mockDelete).toHaveBeenCalledWith('file:///recent/c.docx');
    expect(mockDelete).not.toHaveBeenCalledWith('file:///recent/a.docx');
  });

  it('keeps both when the name is the same but the contents differ', async () => {
    await addRecent(entry('a', { name: 'Report.docx', sha256: 'one' }));
    await addRecent(entry('b', { name: 'Report.docx', sha256: 'two' }));
    expect(savedIds()).toEqual(['b', 'a']);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('removes the oldest with its copy beyond the limit', async () => {
    for (let index = 0; index < MAX_RECENT_FILES; index += 1) await addRecent(entry(`f${index}`));
    expect(mockDelete).not.toHaveBeenCalled();
    await addRecent(entry('newest'));
    const ids = savedIds();
    expect(ids).toHaveLength(MAX_RECENT_FILES);
    expect(ids[0]).toBe('newest');
    expect(ids).not.toContain('f0');
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenCalledWith('file:///recent/f0.docx');
  });

  it('does not lose entries when several are added at once', async () => {
    await Promise.all([addRecent(entry('a')), addRecent(entry('b')), addRecent(entry('c'))]);
    expect(savedIds().sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('removeRecent and clearRecent', () => {
  it('removes one entry and deletes its copy at once', async () => {
    await addRecent(entry('a'));
    await addRecent(entry('b'));
    await removeRecent('a');
    expect(savedIds()).toEqual(['b']);
    expect(mockDelete).toHaveBeenCalledWith('file:///recent/a.docx');
  });

  it('clears the list and every copy', async () => {
    await addRecent(entry('a'));
    await addRecent(entry('b'));
    await clearRecent();
    expect(savedIds()).toEqual([]);
    expect(mockDelete).toHaveBeenCalledWith('file:///recent/a.docx');
    expect(mockDelete).toHaveBeenCalledWith('file:///recent/b.docx');
  });
});

describe('loadRecent', () => {
  it('drops entries whose copy is missing and saves the shorter list', async () => {
    stored = JSON.stringify([entry('a'), entry('b'), entry('c')]);
    mockExists.mockImplementation((uri) => !uri.endsWith('b.docx'));
    expect((await loadRecent()).map((item) => item.id)).toEqual(['a', 'c']);
    expect(savedIds()).toEqual(['a', 'c']);
  });

  it('writes nothing when no copy is missing', async () => {
    stored = JSON.stringify([entry('a')]);
    await loadRecent();
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('is empty when reading the storage fails', async () => {
    mockRead.mockRejectedValue(new Error('disk'));
    expect(await loadRecent()).toEqual([]);
  });
});

describe('setRecentFormat', () => {
  it('fills in the format of one entry', async () => {
    await addRecent(entry('a'));
    await setRecentFormat('a', 'rtf');
    expect(parseRecent(stored)[0]?.format).toBe('rtf');
  });
});

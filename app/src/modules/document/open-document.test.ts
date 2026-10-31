import { addRecent } from '../recent/recent-store';
import { findUnkept } from './document';
import { copyToStore, deleteFile, newId, sha256Of, sourceInfo } from './document-files';
import { addToRecent, openDocument } from './open-document';

jest.mock('./document-files', () => ({
  copyToStore: jest.fn(),
  deleteFile: jest.fn(),
  newId: jest.fn(),
  sha256Of: jest.fn(),
  sourceInfo: jest.fn(),
}));
jest.mock('../recent/recent-store', () => ({ addRecent: jest.fn() }));

const mockSourceInfo = jest.mocked(sourceInfo);
const mockCopy = jest.mocked(copyToStore);
const mockSha = jest.mocked(sha256Of);
const mockNewId = jest.mocked(newId);
const mockDelete = jest.mocked(deleteFile);
const mockAdd = jest.mocked(addRecent);

beforeEach(() => {
  jest.resetAllMocks();
  mockNewId.mockReturnValue('abc123xyz0');
  mockSourceInfo.mockReturnValue({ sizeBytes: 1200, displayName: 'from-uri.docx' });
  mockCopy.mockImplementation(async (_uri, folder, fileName) => ({
    uri: `file:///${folder}/${fileName}`,
    sizeBytes: 1200,
  }));
  mockSha.mockResolvedValue('hash-1');
  mockAdd.mockImplementation(async (entry) => entry);
});

describe('openDocument with recent files on', () => {
  it('copies into the recent folder, using the picker name, and lists it', async () => {
    const result = await openDocument({ uri: 'content://x/1', name: 'Report.docx' }, true);
    expect(mockCopy).toHaveBeenCalledWith('content://x/1', 'recent', 'abc123xyz0.docx');
    expect(mockAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'abc123xyz0',
        name: 'Report.docx',
        sizeBytes: 1200,
        sha256: 'hash-1',
        path: 'file:///recent/abc123xyz0.docx',
      }),
    );
    expect(result).toEqual({
      ok: true,
      document: { id: 'abc123xyz0', name: 'Report.docx', sizeBytes: 1200, path: 'file:///recent/abc123xyz0.docx' },
    });
  });

  it('takes the name from the file when the source gives none (an incoming URI)', async () => {
    const result = await openDocument({ uri: 'content://x/2' }, true);
    expect(result.ok && result.document.name).toBe('from-uri.docx');
  });

  it('calls the document "Document" with extension bin when no name is known', async () => {
    mockSourceInfo.mockReturnValue({ sizeBytes: 5, displayName: null });
    const result = await openDocument({ uri: 'content://x/3' }, true);
    expect(mockCopy).toHaveBeenCalledWith('content://x/3', 'recent', 'abc123xyz0.bin');
    expect(result.ok && result.document.name).toBe('Document');
  });

  it('returns the existing entry when the same document is already listed', async () => {
    mockAdd.mockResolvedValue({
      id: 'old',
      name: 'Report.docx',
      sizeBytes: 1200,
      sha256: 'hash-1',
      openedAt: 1,
      path: 'file:///recent/old.docx',
    });
    const result = await openDocument({ uri: 'content://x/1', name: 'Report.docx' }, true);
    expect(result.ok && result.document.id).toBe('old');
    expect(result.ok && result.document.path).toBe('file:///recent/old.docx');
  });
});

describe('openDocument with recent files off', () => {
  it('copies into the cache folder, adds nothing to the list and remembers the copy', async () => {
    const result = await openDocument({ uri: 'content://x/1', name: 'Report.docx' }, false);
    expect(mockCopy).toHaveBeenCalledWith('content://x/1', 'open', 'abc123xyz0.docx');
    expect(mockAdd).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(findUnkept('abc123xyz0')).toEqual({
      id: 'abc123xyz0',
      name: 'Report.docx',
      sizeBytes: 1200,
      path: 'file:///open/abc123xyz0.docx',
    });
  });
});

describe('openDocument errors', () => {
  it('gives empty and makes no copy for a 0-byte source', async () => {
    mockSourceInfo.mockReturnValue({ sizeBytes: 0, displayName: 'e.docx' });
    const result = await openDocument({ uri: 'content://x/e', name: 'Empty.docx' }, true);
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'empty', fileName: 'Empty.docx', message: 'This file is empty.' }),
    });
    expect(mockCopy).not.toHaveBeenCalled();
  });

  it('gives empty and deletes the copy when a source of unknown size copies to 0 bytes', async () => {
    mockSourceInfo.mockReturnValue({ sizeBytes: null, displayName: 'e.docx' });
    mockCopy.mockResolvedValue({ uri: 'file:///recent/z.docx', sizeBytes: 0 });
    const result = await openDocument({ uri: 'content://x/e' }, true);
    expect(!result.ok && result.error.code).toBe('empty');
    expect(mockDelete).toHaveBeenCalledWith('file:///recent/z.docx');
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('gives read_failed when the copy fails', async () => {
    mockCopy.mockRejectedValue(new Error('permission expired'));
    const result = await openDocument({ uri: 'content://x/1', name: 'Report.docx' }, true);
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'read_failed', fileName: 'Report.docx' }),
    });
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('gives read_failed and removes the copy when hashing fails', async () => {
    mockSha.mockRejectedValue(new Error('io'));
    const result = await openDocument({ uri: 'content://x/1', name: 'Report.docx' }, true);
    expect(!result.ok && result.error.code).toBe('read_failed');
    expect(mockDelete).toHaveBeenCalledWith('file:///recent/abc123xyz0.docx');
  });
});

describe('addToRecent (the other files of a share)', () => {
  it('copies each file into recent files and skips one that fails', async () => {
    mockCopy.mockRejectedValueOnce(new Error('gone'));
    await addToRecent(
      [
        { uri: 'file:///a.docx', name: 'a.docx' },
        { uri: 'file:///b.odt', name: 'b.odt' },
      ],
      true,
    );
    expect(mockCopy).toHaveBeenCalledTimes(2);
    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockAdd).toHaveBeenCalledWith(expect.objectContaining({ name: 'b.odt' }));
  });

  it('copies nothing with recent files off', async () => {
    await addToRecent([{ uri: 'file:///a.docx', name: 'a.docx' }], false);
    expect(mockCopy).not.toHaveBeenCalled();
  });
});

import { defaultSetting } from './setting';
import { loadSetting, parseSetting, saveSetting } from './setting-store';
import { readSetting, writeSetting } from './setting-storage';

jest.mock('./setting-storage', () => ({ readSetting: jest.fn(), writeSetting: jest.fn() }));

const mockRead = jest.mocked(readSetting);
const mockWrite = jest.mocked(writeSetting);

beforeEach(() => {
  jest.resetAllMocks();
});

describe('parseSetting', () => {
  it('returns the defaults when nothing is stored', () => {
    expect(parseSetting(null)).toEqual(defaultSetting);
  });

  it('returns the defaults for invalid JSON', () => {
    expect(parseSetting('{not json')).toEqual(defaultSetting);
  });

  it('returns the defaults when the JSON is not an object', () => {
    expect(parseSetting('[1, 2]')).toEqual(defaultSetting);
    expect(parseSetting('"dark"')).toEqual(defaultSetting);
  });

  it('replaces an unknown size with the default', () => {
    expect(parseSetting(JSON.stringify({ readingTextSize: 21 })).readingTextSize).toBe(18);
  });
});

describe('loadSetting and saveSetting', () => {
  it('loads what was stored', async () => {
    mockRead.mockResolvedValue(JSON.stringify({ theme: 'light', readingTextSize: 24 }));
    expect(await loadSetting()).toEqual({ ...defaultSetting, theme: 'light', readingTextSize: 24 });
  });

  it('falls back to the defaults when reading fails', async () => {
    mockRead.mockRejectedValue(new Error('disk'));
    expect(await loadSetting()).toEqual(defaultSetting);
  });

  it('saves JSON that loads back to the same settings', async () => {
    const setting = {
      ...defaultSetting,
      theme: 'dark' as const,
      defaultMode: 'reading' as const,
      keepRecentFiles: false,
    };
    mockWrite.mockResolvedValue();
    await saveSetting(setting);
    expect(mockWrite).toHaveBeenCalledTimes(1);
    const json = mockWrite.mock.calls[0]?.[0] ?? '';
    expect(parseSetting(json)).toEqual(setting);
  });

  it('leaves the theme out of the saved JSON until one is chosen', async () => {
    mockWrite.mockResolvedValue();
    await saveSetting(defaultSetting);
    expect(JSON.parse(mockWrite.mock.calls[0]?.[0] ?? '{}')).not.toHaveProperty('theme');
  });
});

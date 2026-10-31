import { largeFileLine, looksLikeOutOfMemory } from './large-file';

const MB = 1024 * 1024;

describe('largeFileLine', () => {
  it('has no line up to 30 MB', () => {
    expect(largeFileLine(30 * MB)).toBeNull();
    expect(largeFileLine(1000)).toBeNull();
  });

  it('names the size above 30 MB', () => {
    expect(largeFileLine(42.5 * MB)).toBe('This is a large file (42.5 MB), so it may take a while to open.');
  });
});

describe('looksLikeOutOfMemory', () => {
  it.each(['java.lang.OutOfMemoryError: Failed to allocate', 'out of memory', 'Failed to allocate 100 MB on the heap'])(
    'recognises %s',
    (message) => expect(looksLikeOutOfMemory(new Error(message))).toBe(true),
  );

  it('does not take other failures for it', () => {
    expect(looksLikeOutOfMemory(new Error('File not found'))).toBe(false);
    expect(looksLikeOutOfMemory('permission denied')).toBe(false);
  });
});

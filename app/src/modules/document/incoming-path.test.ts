import { mapIncomingPath } from './incoming-path';

describe('mapIncomingPath', () => {
  it('sends a content URI to the viewer, encoded', () => {
    expect(mapIncomingPath('content://media/external/file/42')).toBe(
      '/viewer?source=content%3A%2F%2Fmedia%2Fexternal%2Ffile%2F42',
    );
  });

  it('sends a file URI to the viewer, encoded', () => {
    expect(mapIncomingPath('file:///storage/a b.docx')).toBe('/viewer?source=file%3A%2F%2F%2Fstorage%2Fa%20b.docx');
  });

  it('leaves other paths alone', () => {
    expect(mapIncomingPath('/settings')).toBe('/settings');
    expect(mapIncomingPath('docxreader://settings')).toBe('docxreader://settings');
    expect(mapIncomingPath('/')).toBe('/');
  });
});

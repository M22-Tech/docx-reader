import { extensionOf } from './document';

describe('extensionOf', () => {
  it('lowercases the last extension', () => {
    expect(extensionOf('Report.DOCX')).toBe('docx');
    expect(extensionOf('a.b.odt')).toBe('odt');
  });

  it('falls back to bin', () => {
    expect(extensionOf('README')).toBe('bin');
    expect(extensionOf('.hidden')).toBe('bin');
    expect(extensionOf('name.')).toBe('bin');
  });

  it('never lets a path through', () => {
    expect(extensionOf('x.d/../../etc')).toBe('bin');
  });
});

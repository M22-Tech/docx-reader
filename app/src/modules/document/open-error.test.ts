import { codeFromPage, openError, OPEN_ERROR_MESSAGES, type OpenErrorCode } from './open-error';

describe('open errors', () => {
  it.each<[OpenErrorCode, string]>([
    ['too_large', 'This document is too large to open on this phone.'],
    ['empty', 'This file is empty.'],
    ['unsupported_format', "This isn't a document DocX Reader can open. It reads .docx, .doc, .rtf and .odt files."],
    ['encrypted', "This document is protected with a password. DocX Reader can't open protected documents yet."],
    ['unsupported_version', "This document was saved in a very old Word format that DocX Reader can't read."],
    ['corrupt', "This document looks damaged and couldn't be opened."],
    ['timeout', 'This document took too long to open.'],
  ])('%s has its message from the spec', (code, message) => {
    expect(OPEN_ERROR_MESSAGES[code]).toBe(message);
    expect(openError(code, 'a.docx')).toEqual({ code, fileName: 'a.docx', message });
  });

  it('shows the corrupt message for the page code internal', () => {
    expect(codeFromPage('internal')).toBe('corrupt');
    expect(openError(codeFromPage('internal'), 'a.docx').message).toBe(OPEN_ERROR_MESSAGES.corrupt);
    expect(codeFromPage('encrypted')).toBe('encrypted');
  });
});

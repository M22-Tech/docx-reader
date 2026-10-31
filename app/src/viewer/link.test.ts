import { openableLink } from './link';

describe('openableLink', () => {
  it.each(['http://example.com', 'https://example.com/a?b=c#d', 'mailto:someone@example.com'])('accepts %s', (href) => {
    expect(openableLink(href)).toBe(href);
  });

  it.each([
    'javascript:alert(1)',
    'file:///sdcard/a.docx',
    'data:text/html,<b>x</b>',
    'content://x/1',
    'intent://x#Intent;end',
    'tel:+123',
    '#bookmark',
    '/relative/path',
    'example.com',
    '',
  ])('refuses %s', (href) => {
    expect(openableLink(href)).toBeNull();
  });

  it('is case-insensitive about the scheme', () => {
    expect(openableLink('HTTPS://EXAMPLE.COM')).toBe('HTTPS://EXAMPLE.COM');
  });
});

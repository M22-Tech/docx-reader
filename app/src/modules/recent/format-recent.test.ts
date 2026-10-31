process.env.TZ = 'Asia/Kolkata';

import { cutName, formatLabel, formatOpened, formatSize } from './format-recent';

// 15 Oct 2025, 14:30 in Asia/Kolkata (UTC+5:30).
const NOW = new Date(2025, 9, 15, 14, 30).getTime();

describe('formatOpened', () => {
  it('shows the time for today and yesterday', () => {
    expect(formatOpened(new Date(2025, 9, 15, 14, 5).getTime(), NOW)).toBe('Today, 14:05');
    expect(formatOpened(new Date(2025, 9, 14, 9, 30).getTime(), NOW)).toBe('Yesterday, 09:30');
  });

  it('counts days by the calendar, not by 24 hours', () => {
    expect(formatOpened(new Date(2025, 9, 14, 23, 59).getTime(), NOW)).toBe('Yesterday, 23:59');
    expect(formatOpened(new Date(2025, 9, 15, 0, 0).getTime(), NOW)).toBe('Today, 00:00');
  });

  it('shows the day and month for older dates this year', () => {
    expect(formatOpened(new Date(2025, 9, 12, 8, 0).getTime(), NOW)).toBe('12 Oct');
    expect(formatOpened(new Date(2025, 0, 3, 8, 0).getTime(), NOW)).toBe('3 Jan');
  });

  it('adds the year when it is not this year', () => {
    expect(formatOpened(new Date(2024, 9, 12, 8, 0).getTime(), NOW)).toBe('12 Oct 2024');
  });

  it('treats yesterday across new year as yesterday', () => {
    const newYear = new Date(2026, 0, 1, 10, 0).getTime();
    expect(formatOpened(new Date(2025, 11, 31, 22, 15).getTime(), newYear)).toBe('Yesterday, 22:15');
  });
});

describe('formatSize', () => {
  it('formats bytes, kilobytes and megabytes', () => {
    expect(formatSize(900)).toBe('900 B');
    expect(formatSize(860_160)).toBe('840 KB');
    expect(formatSize(1_258_291)).toBe('1.2 MB');
    expect(formatSize(44_564_480)).toBe('42.5 MB');
  });

  it('rolls 1023.96 KB over to MB', () => {
    expect(formatSize(1_048_500)).toBe('1.0 MB');
  });
});

describe('cutName', () => {
  it('leaves a short name alone', () => {
    expect(cutName('Report.docx')).toBe('Report.docx');
  });

  it('cuts a long name in the middle and keeps the extension', () => {
    const cut = cutName(`${'a'.repeat(60)}.docx`);
    expect(cut).toHaveLength(40);
    expect(cut.endsWith('.docx')).toBe(true);
    expect(cut).toContain('…');
    expect(cut.startsWith('aaaa')).toBe(true);
  });

  it('cuts a name without an extension too', () => {
    expect(cutName('b'.repeat(80))).toHaveLength(40);
  });

  it('respects another length', () => {
    expect(cutName('quarterly-report-final-v2.docx', 20)).toBe('quarterly-r…-v2.docx');
  });
});

describe('formatLabel', () => {
  it('prefers the format, else the extension', () => {
    expect(formatLabel({ name: 'a.docm', format: 'docx' })).toBe('DOCX');
    expect(formatLabel({ name: 'a.rtf' })).toBe('RTF');
    expect(formatLabel({ name: 'noext' })).toBe('BIN');
  });
});

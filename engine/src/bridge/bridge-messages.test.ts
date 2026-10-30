import { describe, expect, it } from 'vitest';
import {
  parseAppMessage,
  parsePageMessage,
  type AppMessage,
  type PageMessage,
  type ViewerSettings,
} from './bridge-messages';

const settings: ViewerSettings = {
  theme: 'dark',
  textSizePx: 18,
  fontStyle: 'serif',
  colors: { ink: '#111111', paper: '#ffffff' },
};

const appMessages: AppMessage[] = [
  { type: 'open', name: 'a.docx', base64: 'AAAA', mode: 'layout', settings },
  { type: 'setMode', mode: 'reading' },
  { type: 'setSettings', settings },
];

const pageMessages: PageMessage[] = [
  { type: 'ready' },
  { type: 'rendered', format: 'rtf', mode: 'reading', durationMs: 12.5, otherModeAvailable: true },
  { type: 'error', code: 'corrupt', message: 'damaged' },
  { type: 'error', code: 'internal', message: 'oops' },
  { type: 'openLink', href: 'https://example.com' },
];

describe('parseAppMessage', () => {
  it.each(appMessages)('round-trips $type', (message) => {
    expect(parseAppMessage(JSON.parse(JSON.stringify(message)))).toEqual(message);
  });

  it('returns null for unknown types, missing fields and wrong enum values', () => {
    expect(parseAppMessage({ type: 'nope' })).toBeNull();
    expect(parseAppMessage({ type: 'ready' })).toBeNull();
    expect(parseAppMessage({ type: 'setMode' })).toBeNull();
    expect(parseAppMessage({ type: 'setMode', mode: 'print' })).toBeNull();
    expect(parseAppMessage({ type: 'open', name: 'a', base64: '', mode: 'layout' })).toBeNull();
    expect(parseAppMessage({ type: 'setSettings', settings: { ...settings, theme: 'system' } })).toBeNull();
    expect(parseAppMessage(null)).toBeNull();
    expect(parseAppMessage('open')).toBeNull();
  });
});

describe('parsePageMessage', () => {
  it.each(pageMessages)('round-trips $type', (message) => {
    expect(parsePageMessage(JSON.parse(JSON.stringify(message)))).toEqual(message);
  });

  it('returns null for unknown types, missing fields and wrong enum values', () => {
    expect(parsePageMessage({ type: 'nope' })).toBeNull();
    expect(parsePageMessage({ type: 'setMode', mode: 'layout' })).toBeNull();
    expect(parsePageMessage({ type: 'openLink' })).toBeNull();
    expect(parsePageMessage({ type: 'error', code: 'too_large', message: 'x' })).toBeNull();
    expect(
      parsePageMessage({ type: 'rendered', format: 'pdf', mode: 'layout', durationMs: 1, otherModeAvailable: false }),
    ).toBeNull();
    expect(parsePageMessage({ type: 'rendered', format: 'doc', mode: 'layout', durationMs: 1 })).toBeNull();
    expect(parsePageMessage(undefined)).toBeNull();
  });
});

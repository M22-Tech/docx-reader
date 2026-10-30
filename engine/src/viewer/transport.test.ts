import { afterEach, describe, expect, it, vi } from 'vitest';
import { listenToApp, parseIncoming, sendToApp } from './transport';

const settings = { theme: 'light', textSizePx: 18, fontStyle: 'serif', colors: { ink: '#000', paper: '#fff' } };

describe('parseIncoming', () => {
  it('parses a valid JSON string', () => {
    expect(parseIncoming(JSON.stringify({ type: 'setMode', mode: 'reading' }))).toEqual({
      type: 'setMode',
      mode: 'reading',
    });
  });

  it('ignores non-strings, bad JSON and unknown or malformed messages', () => {
    expect(parseIncoming({ type: 'setMode', mode: 'reading' })).toBeNull();
    expect(parseIncoming('{nope')).toBeNull();
    expect(parseIncoming(JSON.stringify({ type: 'other' }))).toBeNull();
    expect(parseIncoming(JSON.stringify({ type: 'setMode', mode: 'wide' }))).toBeNull();
  });
});

describe('listenToApp', () => {
  it('handles messages on window and document, once each', () => {
    const handler = vi.fn();
    listenToApp(handler);
    const data = JSON.stringify({ type: 'setSettings', settings });
    window.dispatchEvent(new MessageEvent('message', { data }));
    document.dispatchEvent(new MessageEvent('message', { data }));
    window.dispatchEvent(new MessageEvent('message', { data: 'garbage' }));
    expect(handler).toHaveBeenCalledTimes(2);
  });
});

describe('sendToApp', () => {
  afterEach(() => {
    delete window.ReactNativeWebView;
  });

  it('posts JSON to the web view bridge when it exists', () => {
    const postMessage = vi.fn();
    window.ReactNativeWebView = { postMessage };
    sendToApp({ type: 'ready' });
    expect(postMessage).toHaveBeenCalledWith('{"type":"ready"}');
  });
});

import { RENDER_TIMEOUT_MS } from '../config/constants';
import { BridgeClient, type BridgeHandlers, type ViewerSettingsInput } from './bridge-client';

const settings: ViewerSettingsInput = {
  theme: 'dark',
  readingTextSize: 20,
  readingFontStyle: 'serif',
  colors: { ink: '#FFFFFF', paper: '#262626' },
};

function setup() {
  const sent: Record<string, unknown>[] = [];
  const handlers = {
    onRendered: jest.fn(),
    onError: jest.fn(),
    onOpenLink: jest.fn(),
    onTimeout: jest.fn(),
    onReadFailed: jest.fn(),
  } satisfies BridgeHandlers;
  const client = new BridgeClient((json) => sent.push(JSON.parse(json) as Record<string, unknown>), handlers, settings);
  const readBase64 = jest.fn().mockResolvedValue('QUJD');
  return { client, sent, handlers, readBase64 };
}

const flush = () =>
  new Promise<void>((resolve) => jest.requireActual<typeof globalThis>('timers').setImmediate(resolve));
const page = (message: object) => JSON.stringify(message);
const rendered = { type: 'rendered', format: 'docx', mode: 'layout', durationMs: 12.5, otherModeAvailable: true };

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('BridgeClient', () => {
  it('sends nothing before the page is ready, then sends open with the settings', async () => {
    const { client, sent, readBase64 } = setup();
    client.open({ name: 'Report.docx', mode: 'reading', readBase64 });
    await flush();
    expect(sent).toEqual([]);
    expect(readBase64).not.toHaveBeenCalled();

    client.receive(page({ type: 'ready' }));
    await flush();
    expect(sent).toEqual([
      {
        type: 'open',
        name: 'Report.docx',
        base64: 'QUJD',
        mode: 'reading',
        settings: {
          theme: 'dark',
          textSizePx: 20,
          fontStyle: 'serif',
          colors: { ink: '#FFFFFF', paper: '#262626' },
        },
      },
    ]);
  });

  it('opens at once when the page was ready before open was called', async () => {
    const { client, sent, readBase64 } = setup();
    client.receive(page({ type: 'ready' }));
    client.open({ name: 'a.docx', mode: 'layout', readBase64 });
    await flush();
    expect(sent).toHaveLength(1);
  });

  it('opens only once even if ready arrives twice', async () => {
    const { client, sent, readBase64 } = setup();
    client.open({ name: 'a.docx', mode: 'layout', readBase64 });
    client.receive(page({ type: 'ready' }));
    client.receive(page({ type: 'ready' }));
    await flush();
    expect(sent).toHaveLength(1);
  });

  it('ignores bad, unknown and non-JSON messages', () => {
    const { client, handlers } = setup();
    client.receive('not json');
    client.receive(page({ type: 'nope' }));
    client.receive(page({ type: 'rendered', format: 'pdf' }));
    client.receive(page({ type: 'openLink' }));
    client.receive('42');
    expect(handlers.onRendered).not.toHaveBeenCalled();
    expect(handlers.onError).not.toHaveBeenCalled();
    expect(handlers.onOpenLink).not.toHaveBeenCalled();
  });

  it('passes rendered, error and openLink to the handlers', () => {
    const { client, handlers } = setup();
    client.receive(page(rendered));
    client.receive(page({ type: 'error', code: 'encrypted', message: 'x' }));
    client.receive(page({ type: 'openLink', href: 'https://example.com' }));
    expect(handlers.onRendered).toHaveBeenCalledWith(rendered);
    expect(handlers.onError).toHaveBeenCalledWith({ type: 'error', code: 'encrypted', message: 'x' });
    expect(handlers.onOpenLink).toHaveBeenCalledWith('https://example.com');
  });

  it('times out when nothing comes back after open', async () => {
    const { client, handlers, readBase64 } = setup();
    client.open({ name: 'a.docx', mode: 'layout', readBase64 });
    client.receive(page({ type: 'ready' }));
    await flush();
    jest.advanceTimersByTime(RENDER_TIMEOUT_MS - 1);
    expect(handlers.onTimeout).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(handlers.onTimeout).toHaveBeenCalledTimes(1);
  });

  it('does not start the timer before open is sent', async () => {
    const { client, handlers } = setup();
    jest.advanceTimersByTime(RENDER_TIMEOUT_MS * 2);
    client.open({ name: 'a.docx', mode: 'layout', readBase64: jest.fn() });
    expect(handlers.onTimeout).not.toHaveBeenCalled();
  });

  it.each([
    ['rendered', rendered],
    ['error', { type: 'error', code: 'corrupt', message: 'x' }],
  ])('stops the timer on %s', async (_name, message) => {
    const { client, handlers, readBase64 } = setup();
    client.open({ name: 'a.docx', mode: 'layout', readBase64 });
    client.receive(page({ type: 'ready' }));
    await flush();
    client.receive(page(message));
    jest.advanceTimersByTime(RENDER_TIMEOUT_MS * 2);
    expect(handlers.onTimeout).not.toHaveBeenCalled();
  });

  it('reports a failed read and sends no open', async () => {
    const { client, sent, handlers } = setup();
    const failure = new Error('out of memory');
    client.open({ name: 'a.docx', mode: 'layout', readBase64: jest.fn().mockRejectedValue(failure) });
    client.receive(page({ type: 'ready' }));
    await flush();
    expect(handlers.onReadFailed).toHaveBeenCalledWith(failure);
    expect(sent).toEqual([]);
  });

  it('sends setMode only after open', async () => {
    const { client, sent, readBase64 } = setup();
    client.setMode('reading');
    expect(sent).toEqual([]);
    client.open({ name: 'a.docx', mode: 'layout', readBase64 });
    client.receive(page({ type: 'ready' }));
    await flush();
    client.setMode('reading');
    expect(sent.at(-1)).toEqual({ type: 'setMode', mode: 'reading' });
  });

  it('sends setSettings again when a setting changes, and not when nothing did', async () => {
    const { client, sent } = setup();
    client.receive(page({ type: 'ready' }));
    client.setSettings(settings);
    expect(sent).toEqual([]);
    client.setSettings({ ...settings, theme: 'light', colors: { ink: '#262626', paper: '#FFFFFF' } });
    client.setSettings({ ...settings, readingTextSize: 24 });
    expect(sent).toEqual([
      {
        type: 'setSettings',
        settings: { theme: 'light', textSizePx: 20, fontStyle: 'serif', colors: { ink: '#262626', paper: '#FFFFFF' } },
      },
      {
        type: 'setSettings',
        settings: { theme: 'dark', textSizePx: 24, fontStyle: 'serif', colors: { ink: '#FFFFFF', paper: '#262626' } },
      },
    ]);
  });

  it('sends settings changed before ready with the open message', async () => {
    const { client, sent, readBase64 } = setup();
    client.setSettings({ ...settings, readingTextSize: 28 });
    client.open({ name: 'a.docx', mode: 'layout', readBase64 });
    client.receive(page({ type: 'ready' }));
    await flush();
    expect(sent).toHaveLength(1);
    expect((sent[0]?.settings as { textSizePx: number }).textSizePx).toBe(28);
  });

  it('does nothing after close', async () => {
    const { client, sent, handlers, readBase64 } = setup();
    client.open({ name: 'a.docx', mode: 'layout', readBase64 });
    client.receive(page({ type: 'ready' }));
    await flush();
    client.close();
    client.receive(page(rendered));
    client.setSettings({ ...settings, readingTextSize: 32 });
    jest.advanceTimersByTime(RENDER_TIMEOUT_MS * 2);
    expect(handlers.onRendered).not.toHaveBeenCalled();
    expect(handlers.onTimeout).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
  });
});

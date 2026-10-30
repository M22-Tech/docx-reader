import { describe, expect, it, vi } from 'vitest';
import { model, para } from '../model/test-models';
import { createModelAdapter } from './model-adapter';

const ctx = () => ({ signal: new AbortController().signal });
const bytes = () => new Uint8Array([1, 2, 3]);

describe('createModelAdapter', () => {
  it('offers both modes for its format', () => {
    const adapter = createModelAdapter('rtf', () => Promise.resolve(model([])));
    expect(adapter.format).toBe('rtf');
    expect(adapter.modes).toEqual(['layout', 'reading']);
  });

  it('parses once for both modes of the same bytes', async () => {
    const parse = vi.fn(() => Promise.resolve(model([para('Hello model')])));
    const adapter = createModelAdapter('odt', parse);
    const input = bytes();
    const container = document.createElement('div');

    const reading = await adapter.renderReading(input, ctx());
    const layout = await adapter.renderLayout?.(input, container, ctx());

    expect(parse).toHaveBeenCalledTimes(1);
    expect(reading).toContain('class="dr-reading"');
    expect(reading).toContain('Hello model');
    expect(container.querySelector('.dr-sheet')?.textContent).toContain('Hello model');
    expect(layout?.pageWidthPx).toBe(794);
  });

  it('parses again for different bytes', async () => {
    const parse = vi.fn(() => Promise.resolve(model([para('x')])));
    const adapter = createModelAdapter('doc', parse);
    await adapter.renderReading(bytes(), ctx());
    await adapter.renderReading(bytes(), ctx());
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it('passes the signal to the parser and does not keep a failed parse', async () => {
    const parse = vi
      .fn<(b: Uint8Array, s: AbortSignal) => Promise<ReturnType<typeof model>>>()
      .mockRejectedValueOnce(new Error('bad'))
      .mockResolvedValue(model([para('ok')]));
    const adapter = createModelAdapter('doc', parse);
    const input = bytes();
    const context = ctx();

    await expect(adapter.renderReading(input, context)).rejects.toThrow('bad');
    await expect(adapter.renderReading(input, context)).resolves.toContain('ok');
    expect(parse).toHaveBeenCalledTimes(2);
    expect(parse.mock.calls[0]?.[1]).toBe(context.signal);
  });

  it('sanitises the Layout output', async () => {
    const adapter = createModelAdapter('rtf', () => Promise.resolve(model([para('safe')])));
    const container = document.createElement('div');
    await adapter.renderLayout?.(bytes(), container, ctx());
    expect(container.querySelectorAll('script')).toHaveLength(0);
  });
});

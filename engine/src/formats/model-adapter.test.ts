import { describe, expect, it, vi } from 'vitest';
import { model, para } from '../model/test-models';
import { createModelAdapter } from './model-adapter';

const ctx = () => ({ signal: new AbortController().signal });
const bytes = () => new Uint8Array([1, 2, 3]);

describe('createModelAdapter', () => {
  it('offers both modes for its format', () => {
    const adapter = createModelAdapter('rtf', () => Promise.resolve(model([])));
    expect(adapter.format).toBe('rtf');
    expect(adapter.modes).toEqual(['raw', 'rendered']);
  });

  it('parses once for both modes of the same bytes', async () => {
    const parse = vi.fn(() => Promise.resolve(model([para('Hello model')])));
    const adapter = createModelAdapter('odt', parse);
    const input = bytes();
    const container = document.createElement('div');

    const rendered = await adapter.renderRendered(input, ctx());
    const raw = await adapter.renderRaw?.(input, container, ctx());

    expect(parse).toHaveBeenCalledTimes(1);
    expect(rendered).toContain('class="dr-rendered"');
    expect(rendered).toContain('Hello model');
    expect(container.querySelector('.dr-sheet')?.textContent).toContain('Hello model');
    expect(raw?.pageWidthPx).toBe(794);
  });

  it('parses again for different bytes', async () => {
    const parse = vi.fn(() => Promise.resolve(model([para('x')])));
    const adapter = createModelAdapter('doc', parse);
    await adapter.renderRendered(bytes(), ctx());
    await adapter.renderRendered(bytes(), ctx());
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

    await expect(adapter.renderRendered(input, context)).rejects.toThrow('bad');
    await expect(adapter.renderRendered(input, context)).resolves.toContain('ok');
    expect(parse).toHaveBeenCalledTimes(2);
    expect(parse.mock.calls[0]?.[1]).toBe(context.signal);
  });

  it('sanitises the Raw output', async () => {
    const adapter = createModelAdapter('rtf', () => Promise.resolve(model([para('safe')])));
    const container = document.createElement('div');
    await adapter.renderRaw?.(bytes(), container, ctx());
    expect(container.querySelectorAll('script')).toHaveLength(0);
  });
});

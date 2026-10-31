import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Page } from '@playwright/test';
import type { AppMessage, PageMessage, ViewerSettings } from '../src/bridge/bridge-messages';

export const VIEWER_PATH = resolve(import.meta.dirname, '../dist/viewer.html');
const FIXTURES = resolve(import.meta.dirname, '../../fixtures');

export const LIGHT: ViewerSettings = {
  theme: 'light',
  textSizePx: 18,
  fontStyle: 'serif',
  colors: { ink: '#111111', paper: '#ffffff' },
};

declare global {
  interface Window {
    __sent: string[];
  }
}

export function fixtureBase64(name: string): string {
  return readFileSync(resolve(FIXTURES, name)).toString('base64');
}

export function textBase64(text: string): string {
  return Buffer.from(text, 'utf-8').toString('base64');
}

export function openMessage(base64: string, mode: 'raw' | 'rendered' = 'rendered', name = 'test'): AppMessage {
  return { type: 'open', name, base64, mode, settings: LIGHT };
}

/** The page loaded the way the app loads it, with a stand-in for the web view's message bridge. */
export class ViewerHarness {
  /** Every request the page made. */
  readonly requests: string[] = [];
  private cursor = 0;

  constructor(readonly page: Page) {
    page.on('request', (request) => this.requests.push(request.url()));
  }

  static async load(page: Page): Promise<ViewerHarness> {
    const harness = new ViewerHarness(page);
    await page.addInitScript(() => {
      window.__sent = [];
      (window as unknown as { ReactNativeWebView: unknown }).ReactNativeWebView = {
        postMessage: (message: string) => window.__sent.push(message),
      };
    });
    await page.goto(pathToFileURL(VIEWER_PATH).href);
    return harness;
  }

  /** Sends app messages in one task, as if they arrived back to back. */
  async send(...messages: AppMessage[]): Promise<void> {
    await this.page.evaluate(
      (jsons) => {
        for (const json of jsons) window.dispatchEvent(new MessageEvent('message', { data: json }));
      },
      messages.map((message) => JSON.stringify(message)),
    );
  }

  /** Every message the page has posted so far. */
  async messages(): Promise<PageMessage[]> {
    const sent = await this.page.evaluate(() => window.__sent);
    return sent.map((json) => JSON.parse(json) as PageMessage);
  }

  /** Waits for the next page message of a type that hasn't been returned yet. */
  async next<T extends PageMessage['type']>(type: T): Promise<Extract<PageMessage, { type: T }>> {
    const handle = await this.page.waitForFunction(
      ({ type: wanted, from }) => {
        const found = window.__sent
          .slice(from)
          .findIndex((json) => (JSON.parse(json) as { type: string }).type === wanted);
        return found === -1 ? null : { index: from + found };
      },
      { type, from: this.cursor },
    );
    const { index } = (await handle.jsonValue()) as { index: number };
    this.cursor = index + 1;
    const sent = await this.page.evaluate((i) => window.__sent[i] ?? '', index);
    return JSON.parse(sent) as Extract<PageMessage, { type: T }>;
  }
}

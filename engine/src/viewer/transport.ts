import { parseAppMessage, type AppMessage, type PageMessage } from '../bridge/bridge-messages';

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage(message: string): void };
  }
}

/** Sends a message to the app, or to the embedding page (the dev harness) when there is no app. */
export function sendToApp(message: PageMessage): void {
  const json = JSON.stringify(message);
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(json);
  else if (window.parent !== window) window.parent.postMessage(json, '*');
}

/** Validates an incoming JSON string; null for anything that isn't a known app message. */
export function parseIncoming(raw: unknown): AppMessage | null {
  if (typeof raw !== 'string') return null;
  try {
    return parseAppMessage(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Calls `handler` for every valid app message; the web view delivers on `window` or `document` by platform. */
export function listenToApp(handler: (message: AppMessage) => void): void {
  const seen = new WeakSet<Event>();
  const onMessage = (event: Event): void => {
    if (seen.has(event)) return;
    seen.add(event);
    const message = parseIncoming((event as MessageEvent).data);
    if (message) handler(message);
  };
  window.addEventListener('message', onMessage);
  document.addEventListener('message', onMessage);
}

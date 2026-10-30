import { parsePageMessage, type AppMessage, type ViewerSettings } from '../src/bridge/bridge-messages';
import type { Mode } from '../src/formats/format-adapter';

const TEXT_SIZES = [14, 16, 18, 20, 22, 24, 28, 32];
const COLORS = {
  light: { ink: '#111111', paper: '#ffffff' },
  dark: { ink: '#f5f5f5', paper: '#111111' },
};

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
}

const frame = byId<HTMLIFrameElement>('viewer');
const fileInput = byId<HTMLInputElement>('file');
const modeButton = byId<HTMLButtonElement>('mode');
const themeButton = byId<HTMLButtonElement>('theme');
const smallerButton = byId<HTMLButtonElement>('smaller');
const largerButton = byId<HTMLButtonElement>('larger');
const sizeLabel = byId('size');
const logElement = byId('log');

let theme: 'light' | 'dark' = 'light';
let sizeIndex = TEXT_SIZES.indexOf(18);
let mode: Mode = 'layout';

function settings(): ViewerSettings {
  return {
    theme,
    textSizePx: TEXT_SIZES[sizeIndex] ?? 18,
    fontStyle: 'serif',
    colors: COLORS[theme],
  };
}

function log(line: string): void {
  logElement.textContent += `${new Date().toLocaleTimeString()} ${line}\n`;
  logElement.scrollTop = logElement.scrollHeight;
}

function send(message: AppMessage, description: string): void {
  log(`-> ${description}`);
  frame.contentWindow?.postMessage(JSON.stringify(message), '*');
}

function renderControls(): void {
  modeButton.textContent = `Mode: ${mode}`;
  themeButton.textContent = `Theme: ${theme}`;
  sizeLabel.textContent = `${TEXT_SIZES[sizeIndex]} px`;
  smallerButton.disabled = sizeIndex === 0;
  largerButton.disabled = sizeIndex === TEXT_SIZES.length - 1;
}

function sendSettings(): void {
  renderControls();
  send({ type: 'setSettings', settings: settings() }, `setSettings ${theme}, ${TEXT_SIZES[sizeIndex]} px`);
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    const base64 = toBase64(reader.result as ArrayBuffer);
    send(
      { type: 'open', name: file.name, base64, mode, settings: settings() },
      `open ${file.name} (${file.size} bytes)`,
    );
  });
  reader.readAsArrayBuffer(file);
});

modeButton.addEventListener('click', () => {
  mode = mode === 'layout' ? 'reading' : 'layout';
  renderControls();
  send({ type: 'setMode', mode }, `setMode ${mode}`);
});

themeButton.addEventListener('click', () => {
  theme = theme === 'light' ? 'dark' : 'light';
  sendSettings();
});

smallerButton.addEventListener('click', () => {
  sizeIndex = Math.max(0, sizeIndex - 1);
  sendSettings();
});

largerButton.addEventListener('click', () => {
  sizeIndex = Math.min(TEXT_SIZES.length - 1, sizeIndex + 1);
  sendSettings();
});

window.addEventListener('message', (event) => {
  if (event.source !== frame.contentWindow || typeof event.data !== 'string') return;
  let message;
  try {
    message = parsePageMessage(JSON.parse(event.data));
  } catch {
    message = null;
  }
  if (!message) return;
  log(`<- ${JSON.stringify(message)}`);
  if (message.type === 'rendered') {
    mode = message.mode;
    modeButton.disabled = !message.otherModeAvailable;
    renderControls();
  } else if (message.type === 'error') {
    modeButton.disabled = true;
  }
});

renderControls();

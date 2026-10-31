import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { openMessage, ViewerHarness } from './viewer-harness';

// Private documents; the folder may be empty. Nothing from them is printed or snapshotted.
const SAMPLES = resolve(import.meta.dirname, '../../samples');
const samplesWith = (extension: string) =>
  (existsSync(SAMPLES) ? readdirSync(SAMPLES, { withFileTypes: true }) : [])
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(extension))
    .map((entry) => entry.name);
const docx = samplesWith('.docx');
const odt = samplesWith('.odt');
const rtf = samplesWith('.rtf');
const doc = samplesWith('.doc');

test.describe('docx samples', () => {
  test.skip(docx.length === 0, 'no .docx files in samples/');

  docx.forEach((file, index) => {
    test(`sample ${index + 1} renders in both modes`, async ({ page }) => {
      const base64 = readFileSync(resolve(SAMPLES, file)).toString('base64');
      const viewer = await ViewerHarness.load(page);
      await viewer.next('ready');
      await viewer.send(openMessage(base64, 'raw'));
      expect(await viewer.next('rendered')).toMatchObject({ format: 'docx', mode: 'raw' });
      await viewer.send({ type: 'setMode', mode: 'rendered' });
      expect(await viewer.next('rendered')).toMatchObject({ format: 'docx', mode: 'rendered' });
      expect((await viewer.messages()).filter((m) => m.type === 'error')).toEqual([]);
    });
  });
});

test.describe('odt samples', () => {
  test.skip(odt.length === 0, 'no .odt files in samples/');

  odt.forEach((file, index) => {
    test(`sample ${index + 1} renders in both modes`, async ({ page }) => {
      const base64 = readFileSync(resolve(SAMPLES, file)).toString('base64');
      const viewer = await ViewerHarness.load(page);
      await viewer.next('ready');
      await viewer.send(openMessage(base64, 'raw'));
      expect(await viewer.next('rendered')).toMatchObject({ format: 'odt', mode: 'raw' });
      await viewer.send({ type: 'setMode', mode: 'rendered' });
      expect(await viewer.next('rendered')).toMatchObject({ format: 'odt', mode: 'rendered' });
      expect((await viewer.messages()).filter((m) => m.type === 'error')).toEqual([]);
    });
  });
});

test.describe('rtf samples', () => {
  test.skip(rtf.length === 0, 'no .rtf files in samples/');

  rtf.forEach((file, index) => {
    test(`sample ${index + 1} renders in both modes`, async ({ page }) => {
      const base64 = readFileSync(resolve(SAMPLES, file)).toString('base64');
      const viewer = await ViewerHarness.load(page);
      await viewer.next('ready');
      await viewer.send(openMessage(base64, 'raw'));
      expect(await viewer.next('rendered')).toMatchObject({ format: 'rtf', mode: 'raw' });
      await viewer.send({ type: 'setMode', mode: 'rendered' });
      expect(await viewer.next('rendered')).toMatchObject({ format: 'rtf', mode: 'rendered' });
      expect((await viewer.messages()).filter((m) => m.type === 'error')).toEqual([]);
    });
  });
});

test.describe('doc samples', () => {
  test.skip(doc.length === 0, 'no .doc files in samples/');

  doc.forEach((file, index) => {
    test(`sample ${index + 1} renders in both modes`, async ({ page }) => {
      const base64 = readFileSync(resolve(SAMPLES, file)).toString('base64');
      const viewer = await ViewerHarness.load(page);
      await viewer.next('ready');
      await viewer.send(openMessage(base64, 'raw'));
      expect(await viewer.next('rendered')).toMatchObject({ format: 'doc', mode: 'raw' });
      await viewer.send({ type: 'setMode', mode: 'rendered' });
      expect(await viewer.next('rendered')).toMatchObject({ format: 'doc', mode: 'rendered' });
      expect((await viewer.messages()).filter((m) => m.type === 'error')).toEqual([]);
    });
  });
});

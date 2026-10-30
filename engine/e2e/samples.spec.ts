import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { openMessage, ViewerHarness } from './viewer-harness';

// Private documents; the folder may be empty. Nothing from them is printed or snapshotted.
const SAMPLES = resolve(import.meta.dirname, '../../samples');
const docx = (existsSync(SAMPLES) ? readdirSync(SAMPLES, { withFileTypes: true }) : [])
  .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.docx'))
  .map((entry) => entry.name);

test.describe('docx samples', () => {
  test.skip(docx.length === 0, 'no .docx files in samples/');

  docx.forEach((file, index) => {
    test(`sample ${index + 1} renders in both modes`, async ({ page }) => {
      const base64 = readFileSync(resolve(SAMPLES, file)).toString('base64');
      const viewer = await ViewerHarness.load(page);
      await viewer.next('ready');
      await viewer.send(openMessage(base64, 'layout'));
      expect(await viewer.next('rendered')).toMatchObject({ format: 'docx', mode: 'layout' });
      await viewer.send({ type: 'setMode', mode: 'reading' });
      expect(await viewer.next('rendered')).toMatchObject({ format: 'docx', mode: 'reading' });
      expect((await viewer.messages()).filter((m) => m.type === 'error')).toEqual([]);
    });
  });
});

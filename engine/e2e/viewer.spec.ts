import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { fixtureBase64, LIGHT, openMessage, textBase64, VIEWER_PATH, ViewerHarness } from './viewer-harness';

const readingText = (page: ViewerHarness['page']) => page.locator('.dr-reading-view');

test('posts ready on load, and the built file carries the strict CSP', async ({ page }) => {
  const viewer = await ViewerHarness.load(page);
  expect(await viewer.next('ready')).toEqual({ type: 'ready' });
  expect(readFileSync(VIEWER_PATH, 'utf-8')).toContain(
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data: blob:" />`,
  );
});

test.describe('html document', () => {
  test('opens in Reading, sanitised, with no network use', async ({ page }) => {
    const dialogs: string[] = [];
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.message());
      void dialog.dismiss();
    });
    const viewer = await ViewerHarness.load(page);
    await viewer.next('ready');
    await viewer.send(openMessage(fixtureBase64('html-named.doc')));

    const rendered = await viewer.next('rendered');
    expect(rendered).toMatchObject({ format: 'html', mode: 'reading', otherModeAvailable: false });
    expect(rendered.durationMs).toBeGreaterThanOrEqual(0);
    await expect(page.getByRole('heading', { name: 'HTML saved as .doc' })).toBeVisible();
    await expect(readingText(page).locator('script')).toHaveCount(0);
    expect(dialogs).toEqual([]);
    await expect(readingText(page).locator('img')).toHaveCount(0);
    await expect(readingText(page).locator('.dr-placeholder')).toHaveCount(1);

    const own = pathToFileURL(VIEWER_PATH).href;
    expect(viewer.requests.filter((url) => url !== own && !url.startsWith('data:'))).toEqual([]);
  });

  test('asking for Layout still renders Reading, and a later setMode is ignored', async ({ page }) => {
    const viewer = await ViewerHarness.load(page);
    await viewer.next('ready');
    await viewer.send(openMessage(fixtureBase64('html-named.doc'), 'layout'));
    expect(await viewer.next('rendered')).toMatchObject({ format: 'html', mode: 'reading' });

    await viewer.send({ type: 'setMode', mode: 'layout' });
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 100)));
    expect((await viewer.messages()).filter((m) => m.type === 'rendered')).toHaveLength(1);
    await expect(page.locator('.dr-reading-view')).toBeVisible();
    await expect(page.locator('.dr-layout-view')).toBeHidden();
  });

  test('ignores setMode before any open', async ({ page }) => {
    const viewer = await ViewerHarness.load(page);
    await viewer.next('ready');
    await viewer.send({ type: 'setMode', mode: 'reading' });
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 100)));
    expect((await viewer.messages()).map((m) => m.type)).toEqual(['ready']);
  });
});

test.describe('errors', () => {
  const cases: [string, string][] = [
    ['not-a-document.docx', 'unsupported_format'],
    ['truncated.docx', 'corrupt'],
    ['empty.docx', 'empty'],
  ];
  for (const [file, code] of cases) {
    test(`${file} reports ${code}`, async ({ page }) => {
      const viewer = await ViewerHarness.load(page);
      await viewer.next('ready');
      await viewer.send(openMessage(fixtureBase64(file)));
      expect(await viewer.next('error')).toMatchObject({ code });
    });
  }
});

test.describe('docx document', () => {
  const ownRequests = (viewer: ViewerHarness) => {
    const own = pathToFileURL(VIEWER_PATH).href;
    return viewer.requests.filter((url) => url !== own && !url.startsWith('data:') && !url.startsWith('blob:'));
  };

  test('features.docx opens in Layout, then switches to Reading', async ({ page }) => {
    const viewer = await ViewerHarness.load(page);
    await viewer.next('ready');
    await viewer.send(openMessage(fixtureBase64('features.docx'), 'layout'));

    expect(await viewer.next('rendered')).toMatchObject({
      format: 'docx',
      mode: 'layout',
      otherModeAvailable: true,
    });
    const layout = page.locator('.dr-layout-view');
    await expect(layout.locator('section.docx')).toHaveCount(2);
    await expect(layout.getByText('Fixture header text').first()).toBeVisible();
    await expect(layout.getByText('This is footnote one, at the bottom of the page.')).toBeVisible();
    expect(await page.locator('meta[name="viewport"]').getAttribute('content')).toContain('width=794');
    const sources = await layout.locator('img').evaluateAll((images) => images.map((img) => img.getAttribute('src')));
    expect(sources.length).toBeGreaterThan(0);
    for (const src of sources) expect(src).toMatch(/^data:/);

    await viewer.send({ type: 'setMode', mode: 'reading' });
    expect(await viewer.next('rendered')).toMatchObject({ format: 'docx', mode: 'reading' });
    const reading = page.locator('.dr-reading-view');
    for (const [level, name] of [
      [1, 'Heading one'],
      [2, 'Heading two'],
      [3, 'Heading three'],
    ] as const) {
      await expect(reading.getByRole('heading', { name, level })).toBeVisible();
    }
    expect(await reading.locator('[style]').count()).toBe(0);

    await reading.getByText('example.com').click();
    expect(await viewer.next('openLink')).toEqual({ type: 'openLink', href: 'https://example.com/path?q=1' });
    expect(ownRequests(viewer)).toEqual([]);
  });

  test('minimal.docx opens in Reading directly', async ({ page }) => {
    const viewer = await ViewerHarness.load(page);
    await viewer.next('ready');
    await viewer.send(openMessage(fixtureBase64('minimal.docx')));
    expect(await viewer.next('rendered')).toMatchObject({ format: 'docx', mode: 'reading' });
    await expect(readingText(page).getByText('Hello, reader.')).toBeVisible();
    expect(ownRequests(viewer)).toEqual([]);
  });
});

test.describe('odt document', () => {
  const ownRequests = (viewer: ViewerHarness) => {
    const own = pathToFileURL(VIEWER_PATH).href;
    return viewer.requests.filter((url) => url !== own && !url.startsWith('data:') && !url.startsWith('blob:'));
  };

  test('features.odt opens in Layout, then switches to Reading', async ({ page }) => {
    const viewer = await ViewerHarness.load(page);
    await viewer.next('ready');
    await viewer.send(openMessage(fixtureBase64('features.odt'), 'layout'));

    expect(await viewer.next('rendered')).toMatchObject({
      format: 'odt',
      mode: 'layout',
      otherModeAvailable: true,
    });
    const layout = page.locator('.dr-layout-view');
    await expect(layout.getByText('Heading one')).toBeVisible();
    await expect(layout.getByText('This is footnote one, at the bottom of the page.')).toBeVisible();
    expect(await page.locator('meta[name="viewport"]').getAttribute('content')).toContain('width=794');
    await expect(layout.locator('hr.dr-page-break')).toHaveCount(1);
    expect(await layout.locator('hr.dr-page-break').evaluate((hr) => getComputedStyle(hr).borderTopStyle)).toBe(
      'dashed',
    );
    const sources = await layout.locator('img').evaluateAll((images) => images.map((img) => img.getAttribute('src')));
    expect(sources).toHaveLength(2);
    for (const src of sources) expect(src).toMatch(/^data:image\/(png|jpeg);base64,/);

    await viewer.send({ type: 'setMode', mode: 'reading' });
    expect(await viewer.next('rendered')).toMatchObject({ format: 'odt', mode: 'reading' });
    const reading = page.locator('.dr-reading-view');
    for (const [level, name] of [
      [1, 'Heading one'],
      [2, 'Heading two'],
      [3, 'Heading three'],
    ] as const) {
      await expect(reading.getByRole('heading', { name, level })).toBeVisible();
    }
    expect(await reading.locator('[style]').count()).toBe(0);

    await reading.getByText('example.com').click();
    expect(await viewer.next('openLink')).toEqual({ type: 'openLink', href: 'https://example.com/path?q=1' });
    expect(ownRequests(viewer)).toEqual([]);
  });

  test('minimal.odt opens in Reading directly', async ({ page }) => {
    const viewer = await ViewerHarness.load(page);
    await viewer.next('ready');
    await viewer.send(openMessage(fixtureBase64('minimal.odt')));
    expect(await viewer.next('rendered')).toMatchObject({ format: 'odt', mode: 'reading' });
    await expect(readingText(page).getByText('Hello, reader.')).toBeVisible();
    expect(ownRequests(viewer)).toEqual([]);
  });
});

test.describe('rtf document', () => {
  const ownRequests = (viewer: ViewerHarness) => {
    const own = pathToFileURL(VIEWER_PATH).href;
    return viewer.requests.filter((url) => url !== own && !url.startsWith('data:') && !url.startsWith('blob:'));
  };

  test('features.rtf opens in Layout, then switches to Reading', async ({ page }) => {
    const viewer = await ViewerHarness.load(page);
    await viewer.next('ready');
    await viewer.send(openMessage(fixtureBase64('features.rtf'), 'layout'));

    expect(await viewer.next('rendered')).toMatchObject({
      format: 'rtf',
      mode: 'layout',
      otherModeAvailable: true,
    });
    const layout = page.locator('.dr-layout-view');
    await expect(layout.getByText('Heading one')).toBeVisible();
    await expect(layout.getByText('This is footnote one, at the bottom of the page.')).toBeVisible();
    await expect(layout.getByText('Fixture header text')).toHaveCount(0);
    expect(await page.locator('meta[name="viewport"]').getAttribute('content')).toContain('width=794');
    await expect(layout.locator('hr.dr-page-break')).toHaveCount(1);
    const sources = await layout.locator('img').evaluateAll((images) => images.map((img) => img.getAttribute('src')));
    expect(sources).toHaveLength(2);
    for (const src of sources) expect(src).toMatch(/^data:image\/(png|jpeg);base64,/);

    await viewer.send({ type: 'setMode', mode: 'reading' });
    expect(await viewer.next('rendered')).toMatchObject({ format: 'rtf', mode: 'reading' });
    const reading = page.locator('.dr-reading-view');
    for (const [level, name] of [
      [1, 'Heading one'],
      [2, 'Heading two'],
      [3, 'Heading three'],
    ] as const) {
      await expect(reading.getByRole('heading', { name, level })).toBeVisible();
    }
    expect(await reading.locator('[style]').count()).toBe(0);

    await reading.getByText('example.com').click();
    expect(await viewer.next('openLink')).toEqual({ type: 'openLink', href: 'https://example.com/path?q=1' });
    expect(ownRequests(viewer)).toEqual([]);
  });

  test('minimal.rtf opens in Reading directly', async ({ page }) => {
    const viewer = await ViewerHarness.load(page);
    await viewer.next('ready');
    await viewer.send(openMessage(fixtureBase64('minimal.rtf')));
    expect(await viewer.next('rendered')).toMatchObject({ format: 'rtf', mode: 'reading' });
    await expect(readingText(page).getByText('Hello, reader.')).toBeVisible();
    expect(ownRequests(viewer)).toEqual([]);
  });

  test('rtf-named.doc is read as rtf', async ({ page }) => {
    const viewer = await ViewerHarness.load(page);
    await viewer.next('ready');
    await viewer.send(openMessage(fixtureBase64('rtf-named.doc')));
    expect(await viewer.next('rendered')).toMatchObject({ format: 'rtf', mode: 'reading' });
    await expect(readingText(page).getByText('Hello, reader.')).toBeVisible();
  });
});

test.describe('doc document', () => {
  const ownRequests = (viewer: ViewerHarness) => {
    const own = pathToFileURL(VIEWER_PATH).href;
    return viewer.requests.filter((url) => url !== own && !url.startsWith('data:') && !url.startsWith('blob:'));
  };

  test('features.doc opens in Layout, then switches to Reading', async ({ page }) => {
    const viewer = await ViewerHarness.load(page);
    await viewer.next('ready');
    await viewer.send(openMessage(fixtureBase64('features.doc'), 'layout'));

    expect(await viewer.next('rendered')).toMatchObject({ format: 'doc', mode: 'layout', otherModeAvailable: true });
    const layout = page.locator('.dr-layout-view');
    await expect(layout.getByText('Heading one')).toBeVisible();
    await expect(layout.getByText('Fixture header text')).toHaveCount(0);

    await viewer.send({ type: 'setMode', mode: 'reading' });
    expect(await viewer.next('rendered')).toMatchObject({ format: 'doc', mode: 'reading' });
    const reading = page.locator('.dr-reading-view');
    await expect(reading.getByText('Heading one')).toBeVisible();

    await reading.getByText('example.com').click();
    expect(await viewer.next('openLink')).toEqual({ type: 'openLink', href: 'https://example.com/path?q=1' });
    expect(ownRequests(viewer)).toEqual([]);
  });

  test('minimal.doc opens in Reading directly', async ({ page }) => {
    const viewer = await ViewerHarness.load(page);
    await viewer.next('ready');
    await viewer.send(openMessage(fixtureBase64('minimal.doc')));
    expect(await viewer.next('rendered')).toMatchObject({ format: 'doc', mode: 'reading' });
    await expect(readingText(page).getByText('Hello, reader.')).toBeVisible();
    expect(ownRequests(viewer)).toEqual([]);
  });
});

test.describe('links', () => {
  const paragraphs = Array.from({ length: 80 }, (_, i) => `<p>Filler paragraph ${i}</p>`).join('');
  const html = `<html><body>
    <p><a href="https://example.com/page?q=1">External</a> <a href="mailto:me@example.com">Mail</a> <a href="#section">Internal</a></p>
    ${paragraphs}<h2 id="section">Target heading</h2><p>End</p></body></html>`;

  test('external links ask the app, internal links scroll, the URL never changes', async ({ page }) => {
    const viewer = await ViewerHarness.load(page);
    await viewer.next('ready');
    const url = page.url();
    await viewer.send(openMessage(textBase64(html)));
    await viewer.next('rendered');

    await page.getByText('External').click();
    expect(await viewer.next('openLink')).toEqual({ type: 'openLink', href: 'https://example.com/page?q=1' });
    await page.getByText('Mail').click();
    expect(await viewer.next('openLink')).toEqual({ type: 'openLink', href: 'mailto:me@example.com' });

    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await page.getByText('Internal').click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await expect(page.getByRole('heading', { name: 'Target heading' })).toBeInViewport();
    expect(page.url()).toBe(url);
  });
});

test('setSettings changes the page variables without a new rendered message', async ({ page }) => {
  const viewer = await ViewerHarness.load(page);
  await viewer.next('ready');
  await viewer.send(openMessage(textBase64('<html><body><p>Some text</p></body></html>')));
  await viewer.next('rendered');

  const variables = () =>
    page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return ['--ink', '--paper', '--text-size', '--font'].map((name) => style.getPropertyValue(name).trim());
    });
  expect(await variables()).toEqual(['#111111', '#ffffff', '18px', 'serif']);

  await viewer.send({
    type: 'setSettings',
    settings: {
      ...LIGHT,
      theme: 'dark',
      textSizePx: 24,
      fontStyle: 'sans',
      colors: { ink: '#eeeeee', paper: '#101010' },
    },
  });
  expect(await variables()).toEqual(['#eeeeee', '#101010', '24px', 'sans-serif']);
  expect((await viewer.messages()).filter((m) => m.type === 'rendered')).toHaveLength(1);
});

test('a second open while the first is rendering reports only the second', async ({ page }) => {
  const viewer = await ViewerHarness.load(page);
  await viewer.next('ready');
  await viewer.send(
    openMessage(textBase64('<html><body><h1>First document</h1></body></html>')),
    openMessage(textBase64('<html><body><h1>Second document</h1></body></html>')),
  );
  await viewer.next('rendered');
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 200)));

  const types = (await viewer.messages()).map((m) => m.type);
  expect(types.filter((type) => type === 'rendered')).toHaveLength(1);
  expect(types).not.toContain('error');
  await expect(page.getByRole('heading', { name: 'Second document' })).toBeVisible();
  await expect(page.getByText('First document')).toHaveCount(0);
});

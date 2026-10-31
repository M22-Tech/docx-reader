import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { fixtureBase64, LIGHT, openMessage, textBase64, VIEWER_PATH, ViewerHarness } from './viewer-harness';

const renderedText = (page: ViewerHarness['page']) => page.locator('.dr-rendered-view');

test('posts ready on load, and the built file carries the strict CSP', async ({ page }) => {
  const viewer = await ViewerHarness.load(page);
  expect(await viewer.next('ready')).toEqual({ type: 'ready' });
  expect(readFileSync(VIEWER_PATH, 'utf-8')).toContain(
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data: blob:" />`,
  );
});

test.describe('html document', () => {
  test('opens in Rendered, sanitised, with no network use', async ({ page }) => {
    const dialogs: string[] = [];
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.message());
      void dialog.dismiss();
    });
    const viewer = await ViewerHarness.load(page);
    await viewer.next('ready');
    await viewer.send(openMessage(fixtureBase64('html-named.doc')));

    const rendered = await viewer.next('rendered');
    expect(rendered).toMatchObject({ format: 'html', mode: 'rendered', otherModeAvailable: true });
    expect(rendered.durationMs).toBeGreaterThanOrEqual(0);
    await expect(page.getByRole('heading', { name: 'HTML saved as .doc' })).toBeVisible();
    await expect(renderedText(page).locator('script')).toHaveCount(0);
    expect(dialogs).toEqual([]);
    await expect(renderedText(page).locator('img')).toHaveCount(0);
    await expect(renderedText(page).locator('.dr-placeholder')).toHaveCount(1);

    const own = pathToFileURL(VIEWER_PATH).href;
    expect(viewer.requests.filter((url) => url !== own && !url.startsWith('data:'))).toEqual([]);
  });

  test('opens in Raw as source text, then switches to Rendered and back', async ({ page }) => {
    const dialogs: string[] = [];
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.message());
      void dialog.dismiss();
    });
    const viewer = await ViewerHarness.load(page);
    await viewer.next('ready');
    await viewer.send(openMessage(fixtureBase64('html-named.doc'), 'raw'));
    expect(await viewer.next('rendered')).toMatchObject({
      format: 'html',
      mode: 'raw',
      otherModeAvailable: true,
    });

    const raw = page.locator('.dr-raw-view');
    await expect(raw).toBeVisible();
    await expect(page.locator('.dr-rendered-view')).toBeHidden();
    await expect(raw.locator('pre.dr-source')).toContainText('<h1>HTML saved as .doc</h1>');
    await expect(raw.locator('pre.dr-source')).toContainText('<script>alert(1)</script>');
    // The markup is text: no element came out of it.
    await expect(raw.locator('script, h1, img')).toHaveCount(0);
    expect(dialogs).toEqual([]);
    expect(await page.locator('meta[name="viewport"]').getAttribute('content')).toBe(
      'width=device-width, initial-scale=1, user-scalable=no',
    );

    await viewer.send({ type: 'setMode', mode: 'rendered' });
    expect(await viewer.next('rendered')).toMatchObject({ format: 'html', mode: 'rendered' });
    await expect(page.getByRole('heading', { name: 'HTML saved as .doc' })).toBeVisible();
    await expect(raw).toBeHidden();

    await viewer.send({ type: 'setMode', mode: 'raw' });
    expect(await viewer.next('rendered')).toMatchObject({ format: 'html', mode: 'raw' });
    await expect(raw.locator('pre.dr-source')).toContainText('<h1>HTML saved as .doc</h1>');
    const own = pathToFileURL(VIEWER_PATH).href;
    expect(viewer.requests.filter((url) => url !== own && !url.startsWith('data:'))).toEqual([]);
  });

  test('ignores setMode before any open', async ({ page }) => {
    const viewer = await ViewerHarness.load(page);
    await viewer.next('ready');
    await viewer.send({ type: 'setMode', mode: 'rendered' });
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

  test('features.docx opens in Raw, then switches to Rendered', async ({ page }) => {
    const viewer = await ViewerHarness.load(page);
    await viewer.next('ready');
    await viewer.send(openMessage(fixtureBase64('features.docx'), 'raw'));

    expect(await viewer.next('rendered')).toMatchObject({
      format: 'docx',
      mode: 'raw',
      otherModeAvailable: true,
    });
    const raw = page.locator('.dr-raw-view');
    await expect(raw.locator('section.docx')).toHaveCount(2);
    await expect(raw.getByText('Fixture header text').first()).toBeVisible();
    await expect(raw.getByText('This is footnote one, at the bottom of the page.')).toBeVisible();
    expect(await page.locator('meta[name="viewport"]').getAttribute('content')).toContain('width=794');
    const sources = await raw.locator('img').evaluateAll((images) => images.map((img) => img.getAttribute('src')));
    expect(sources.length).toBeGreaterThan(0);
    for (const src of sources) expect(src).toMatch(/^data:/);

    await viewer.send({ type: 'setMode', mode: 'rendered' });
    expect(await viewer.next('rendered')).toMatchObject({ format: 'docx', mode: 'rendered' });
    const rendered = page.locator('.dr-rendered-view');
    for (const [level, name] of [
      [1, 'Heading one'],
      [2, 'Heading two'],
      [3, 'Heading three'],
    ] as const) {
      await expect(rendered.getByRole('heading', { name, level })).toBeVisible();
    }
    expect(await rendered.locator('[style]').count()).toBe(0);

    await rendered.getByText('example.com').click();
    expect(await viewer.next('openLink')).toEqual({ type: 'openLink', href: 'https://example.com/path?q=1' });
    expect(ownRequests(viewer)).toEqual([]);
  });

  test('minimal.docx opens in Rendered directly', async ({ page }) => {
    const viewer = await ViewerHarness.load(page);
    await viewer.next('ready');
    await viewer.send(openMessage(fixtureBase64('minimal.docx')));
    expect(await viewer.next('rendered')).toMatchObject({ format: 'docx', mode: 'rendered' });
    await expect(renderedText(page).getByText('Hello, reader.')).toBeVisible();
    expect(ownRequests(viewer)).toEqual([]);
  });
});

test.describe('odt document', () => {
  const ownRequests = (viewer: ViewerHarness) => {
    const own = pathToFileURL(VIEWER_PATH).href;
    return viewer.requests.filter((url) => url !== own && !url.startsWith('data:') && !url.startsWith('blob:'));
  };

  test('features.odt opens in Raw, then switches to Rendered', async ({ page }) => {
    const viewer = await ViewerHarness.load(page);
    await viewer.next('ready');
    await viewer.send(openMessage(fixtureBase64('features.odt'), 'raw'));

    expect(await viewer.next('rendered')).toMatchObject({
      format: 'odt',
      mode: 'raw',
      otherModeAvailable: true,
    });
    const raw = page.locator('.dr-raw-view');
    await expect(raw.getByText('Heading one')).toBeVisible();
    await expect(raw.getByText('This is footnote one, at the bottom of the page.')).toBeVisible();
    expect(await page.locator('meta[name="viewport"]').getAttribute('content')).toContain('width=794');
    await expect(raw.locator('hr.dr-page-break')).toHaveCount(1);
    expect(await raw.locator('hr.dr-page-break').evaluate((hr) => getComputedStyle(hr).borderTopStyle)).toBe('dashed');
    const sources = await raw.locator('img').evaluateAll((images) => images.map((img) => img.getAttribute('src')));
    expect(sources).toHaveLength(2);
    for (const src of sources) expect(src).toMatch(/^data:image\/(png|jpeg);base64,/);

    await viewer.send({ type: 'setMode', mode: 'rendered' });
    expect(await viewer.next('rendered')).toMatchObject({ format: 'odt', mode: 'rendered' });
    const rendered = page.locator('.dr-rendered-view');
    for (const [level, name] of [
      [1, 'Heading one'],
      [2, 'Heading two'],
      [3, 'Heading three'],
    ] as const) {
      await expect(rendered.getByRole('heading', { name, level })).toBeVisible();
    }
    expect(await rendered.locator('[style]').count()).toBe(0);

    await rendered.getByText('example.com').click();
    expect(await viewer.next('openLink')).toEqual({ type: 'openLink', href: 'https://example.com/path?q=1' });
    expect(ownRequests(viewer)).toEqual([]);
  });

  test('minimal.odt opens in Rendered directly', async ({ page }) => {
    const viewer = await ViewerHarness.load(page);
    await viewer.next('ready');
    await viewer.send(openMessage(fixtureBase64('minimal.odt')));
    expect(await viewer.next('rendered')).toMatchObject({ format: 'odt', mode: 'rendered' });
    await expect(renderedText(page).getByText('Hello, reader.')).toBeVisible();
    expect(ownRequests(viewer)).toEqual([]);
  });
});

test.describe('rtf document', () => {
  const ownRequests = (viewer: ViewerHarness) => {
    const own = pathToFileURL(VIEWER_PATH).href;
    return viewer.requests.filter((url) => url !== own && !url.startsWith('data:') && !url.startsWith('blob:'));
  };

  test('features.rtf opens in Raw, then switches to Rendered', async ({ page }) => {
    const viewer = await ViewerHarness.load(page);
    await viewer.next('ready');
    await viewer.send(openMessage(fixtureBase64('features.rtf'), 'raw'));

    expect(await viewer.next('rendered')).toMatchObject({
      format: 'rtf',
      mode: 'raw',
      otherModeAvailable: true,
    });
    const raw = page.locator('.dr-raw-view');
    await expect(raw.getByText('Heading one')).toBeVisible();
    await expect(raw.getByText('This is footnote one, at the bottom of the page.')).toBeVisible();
    await expect(raw.getByText('Fixture header text')).toHaveCount(0);
    expect(await page.locator('meta[name="viewport"]').getAttribute('content')).toContain('width=794');
    await expect(raw.locator('hr.dr-page-break')).toHaveCount(1);
    const sources = await raw.locator('img').evaluateAll((images) => images.map((img) => img.getAttribute('src')));
    expect(sources).toHaveLength(2);
    for (const src of sources) expect(src).toMatch(/^data:image\/(png|jpeg);base64,/);

    await viewer.send({ type: 'setMode', mode: 'rendered' });
    expect(await viewer.next('rendered')).toMatchObject({ format: 'rtf', mode: 'rendered' });
    const rendered = page.locator('.dr-rendered-view');
    for (const [level, name] of [
      [1, 'Heading one'],
      [2, 'Heading two'],
      [3, 'Heading three'],
    ] as const) {
      await expect(rendered.getByRole('heading', { name, level })).toBeVisible();
    }
    expect(await rendered.locator('[style]').count()).toBe(0);

    await rendered.getByText('example.com').click();
    expect(await viewer.next('openLink')).toEqual({ type: 'openLink', href: 'https://example.com/path?q=1' });
    expect(ownRequests(viewer)).toEqual([]);
  });

  test('minimal.rtf opens in Rendered directly', async ({ page }) => {
    const viewer = await ViewerHarness.load(page);
    await viewer.next('ready');
    await viewer.send(openMessage(fixtureBase64('minimal.rtf')));
    expect(await viewer.next('rendered')).toMatchObject({ format: 'rtf', mode: 'rendered' });
    await expect(renderedText(page).getByText('Hello, reader.')).toBeVisible();
    expect(ownRequests(viewer)).toEqual([]);
  });

  test('rtf-named.doc is read as rtf', async ({ page }) => {
    const viewer = await ViewerHarness.load(page);
    await viewer.next('ready');
    await viewer.send(openMessage(fixtureBase64('rtf-named.doc')));
    expect(await viewer.next('rendered')).toMatchObject({ format: 'rtf', mode: 'rendered' });
    await expect(renderedText(page).getByText('Hello, reader.')).toBeVisible();
  });
});

test.describe('doc document', () => {
  const ownRequests = (viewer: ViewerHarness) => {
    const own = pathToFileURL(VIEWER_PATH).href;
    return viewer.requests.filter((url) => url !== own && !url.startsWith('data:') && !url.startsWith('blob:'));
  };

  test('features.doc opens in Raw, then switches to Rendered', async ({ page }) => {
    const viewer = await ViewerHarness.load(page);
    await viewer.next('ready');
    await viewer.send(openMessage(fixtureBase64('features.doc'), 'raw'));

    expect(await viewer.next('rendered')).toMatchObject({ format: 'doc', mode: 'raw', otherModeAvailable: true });
    const raw = page.locator('.dr-raw-view');
    await expect(raw.getByText('Heading one')).toBeVisible();
    await expect(raw.getByText('Fixture header text')).toHaveCount(0);
    expect(await raw.getByText('red', { exact: true }).evaluate((el) => getComputedStyle(el).color)).toBe(
      'rgb(192, 0, 0)',
    );
    await expect(raw.locator('hr.dr-page-break')).toHaveCount(1);
    expect(await raw.locator('hr.dr-page-break').evaluate((hr) => getComputedStyle(hr).borderTopStyle)).toBe('dashed');
    expect(await page.locator('meta[name="viewport"]').getAttribute('content')).toContain('width=794');

    await viewer.send({ type: 'setMode', mode: 'rendered' });
    expect(await viewer.next('rendered')).toMatchObject({ format: 'doc', mode: 'rendered' });
    const rendered = page.locator('.dr-rendered-view');
    await expect(rendered.getByText('Heading one')).toBeVisible();
    await expect(rendered.locator('table')).toHaveCount(1);
    await expect(rendered.locator('table tr')).toHaveCount(4);
    await expect(rendered.locator('table').getByText('Delhi')).toBeVisible();
    await expect(rendered.locator('.dr-marker', { hasText: 'a)' })).toBeVisible();
    await expect(rendered.locator('.dr-marker', { hasText: '•' })).toBeVisible();

    await rendered.getByText('example.com').click();
    expect(await viewer.next('openLink')).toEqual({ type: 'openLink', href: 'https://example.com/path?q=1' });
    expect(ownRequests(viewer)).toEqual([]);
  });

  for (const [mode, view] of [
    ['raw', '.dr-raw-view'],
    ['rendered', '.dr-rendered-view'],
  ] as const) {
    test(`features.doc in ${mode} shows both images and the footnote, and the reference scrolls to it`, async ({
      page,
    }) => {
      const viewer = await ViewerHarness.load(page);
      await viewer.next('ready');
      await viewer.send(openMessage(fixtureBase64('features.doc'), mode));
      expect(await viewer.next('rendered')).toMatchObject({ format: 'doc', mode });

      const root = page.locator(view);
      const sources = await root.locator('img').evaluateAll((images) => images.map((img) => img.getAttribute('src')));
      expect(sources).toHaveLength(2);
      expect(sources[0]).toMatch(/^data:image\/png;base64,iVBORw0KGgo/);
      expect(sources[1]).toMatch(/^data:image\/jpeg;base64,\/9j\//);
      await expect(root.locator('.dr-placeholder')).toHaveCount(0);

      const note = root.locator('.dr-note');
      await expect(note).toHaveCount(1);
      await expect(note).toContainText('This is footnote one, at the bottom of the page.');
      // The notes come last in the document.
      expect(await root.locator('.dr-notes').evaluate((el) => el === el.parentElement?.lastElementChild)).toBe(true);

      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      await root.locator('.dr-noteref a').click();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
      await expect(note).toBeInViewport();
      expect(ownRequests(viewer)).toEqual([]);
    });
  }

  test('after a mode switch, the footnote reference scrolls to the note in the view that is shown', async ({
    page,
  }) => {
    const viewer = await ViewerHarness.load(page);
    await viewer.next('ready');
    await viewer.send(openMessage(fixtureBase64('features.doc'), 'raw'));
    expect(await viewer.next('rendered')).toMatchObject({ mode: 'raw' });
    await viewer.send({ type: 'setMode', mode: 'rendered' });
    expect(await viewer.next('rendered')).toMatchObject({ mode: 'rendered' });

    // The hidden Raw view still holds a note with the same id.
    await expect(page.locator('.dr-raw-view .dr-note')).toHaveCount(1);
    const rendered = page.locator('.dr-rendered-view');
    await page.evaluate(() => window.scrollTo(0, 0));
    await rendered.locator('.dr-noteref a').click();
    await expect(rendered.locator('.dr-note')).toBeInViewport();
  });

  test('minimal.doc opens in Rendered directly', async ({ page }) => {
    const viewer = await ViewerHarness.load(page);
    await viewer.next('ready');
    await viewer.send(openMessage(fixtureBase64('minimal.doc')));
    expect(await viewer.next('rendered')).toMatchObject({ format: 'doc', mode: 'rendered' });
    await expect(renderedText(page).getByText('Hello, reader.')).toBeVisible();
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

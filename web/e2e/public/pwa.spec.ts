import type { Page } from '@playwright/test';

import { expect, test } from '../fixture';

async function loadManifest(page: Page) {
  await page.goto('login/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href, 'manifest link').toBeTruthy();
  const { status, body } = await page.evaluate(async (url) => {
    const response = await fetch(url as string);
    return { status: response.status, body: await response.json() };
  }, href);
  return { url: new URL(href!, page.url()), status, body };
}

// manifest.test.ts checks the file on disk; this checks what it links resolves at the deployed base path.
test.describe('the installable app', () => {
  test('links a manifest that the browser can fetch', async ({ page }) => {
    const { status, body } = await loadManifest(page);

    expect(status).toBe(200);
    expect(body.name).toBe('CollectionBuddy');
    expect(body.display).toBe('standalone');
    expect(body.background_color).toBe('#f4f3ef');
  });

  test('serves every icon it advertises', async ({ page, request }) => {
    const { url: manifestUrl, body } = await loadManifest(page);

    const icons: { src: string; sizes: string; purpose?: string }[] =
      body.icons;
    expect(icons.length).toBeGreaterThan(0);

    for (const icon of icons) {
      // A manifest's URLs resolve against the manifest, not the page that links it.
      const url = new URL(icon.src, manifestUrl).toString();
      const response = await request.get(url);
      expect(response.status(), `${icon.src} (${icon.sizes})`).toBe(200);
      expect(response.headers()['content-type']).toContain('image/png');

      // Real dimensions from the PNG header, to catch a manifest entry that drifted from its file.
      const bytes = Buffer.from(await response.body());
      const [width, height] = [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
      expect(`${width}x${height}`, `${icon.src} real size`).toBe(icon.sizes);
    }
  });

  test('offers an icon big enough for a splash screen', async ({ page }) => {
    const { body } = await loadManifest(page);
    const large = body.icons.filter(
      (icon: { sizes: string; purpose?: string }) =>
        icon.purpose !== 'maskable' && Number(icon.sizes.split('x')[0]) >= 512,
    );
    expect(large.length).toBeGreaterThan(0);
  });

  test('serves the apple touch icon it links', async ({ page, request }) => {
    await page.goto('login/');
    const href = await page
      .locator('link[rel="apple-touch-icon"]')
      .getAttribute('href');
    expect(href).toBeTruthy();
    const response = await request.get(new URL(href!, page.url()).toString());
    expect(response.status()).toBe(200);
  });

  // Relative in the file, so what matters is where they resolve at the deployed base path.
  test('scopes the manifest to where the app is actually served', async ({
    page,
  }) => {
    const { url: manifestUrl, body } = await loadManifest(page);
    // The page is `<app root>/login/`.
    const appRoot = new URL('../', page.url()).pathname;
    expect(new URL(body.scope, manifestUrl).pathname).toBe(appRoot);
    expect(new URL(body.start_url, manifestUrl).pathname).toBe(appRoot);
  });
});

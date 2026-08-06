import { expect, test } from '@playwright/test';

// manifest.test.ts already holds the manifest to its own claims on disk. This
// asks the other half of the question: whether what is *deployed* still
// answers, at its real origin and under its real base path. Those are exactly
// the two things a unit test cannot see, and an icon that 404s in production
// is invisible until somebody installs the app and gets a grey square (#266).
test.describe('the installable app', () => {
  test('links a manifest that the browser can fetch', async ({ page }) => {
    await page.goto('login/');
    const href = await page
      .locator('link[rel="manifest"]')
      .getAttribute('href');
    expect(href).toBeTruthy();

    const manifest = await page.evaluate(async (url) => {
      const response = await fetch(url as string);
      return { status: response.status, body: await response.json() };
    }, href);

    expect(manifest.status).toBe(200);
    expect(manifest.body.name).toBe('CollectionBuddy');
    expect(manifest.body.display).toBe('standalone');
    expect(manifest.body.background_color).toBe('#f4f3ef');
  });

  test('serves every icon it advertises', async ({ page, request }) => {
    await page.goto('login/');
    const href = await page
      .locator('link[rel="manifest"]')
      .getAttribute('href');
    const manifest = await page.evaluate(
      async (url) => (await fetch(url as string)).json(),
      href,
    );

    const icons: { src: string; sizes: string; purpose?: string }[] =
      manifest.icons;
    expect(icons.length).toBeGreaterThan(0);

    for (const icon of icons) {
      const url = new URL(icon.src, page.url()).toString();
      const response = await request.get(url);
      expect(response.status(), `${icon.src} (${icon.sizes})`).toBe(200);
      expect(response.headers()['content-type']).toContain('image/png');

      // The PNG header carries the real dimensions, so a manifest entry that
      // has drifted from its file is caught here rather than by a launcher.
      const bytes = Buffer.from(await response.body());
      const [width, height] = [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
      expect(`${width}x${height}`, `${icon.src} real size`).toBe(icon.sizes);
    }
  });

  // The size Android wants for a splash screen, and the one whose absence was
  // the whole of #266 -- it fell back to stretching the 180px apple icon.
  test('offers an icon big enough for a splash screen', async ({ page }) => {
    await page.goto('login/');
    const href = await page
      .locator('link[rel="manifest"]')
      .getAttribute('href');
    const manifest = await page.evaluate(
      async (url) => (await fetch(url as string)).json(),
      href,
    );
    const large = manifest.icons.filter(
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

  // Every path in the manifest is written out by hand, because a static file
  // cannot interpolate the base path the way the app's own links do.
  test('scopes the manifest to where the app is actually served', async ({
    page,
  }) => {
    await page.goto('login/');
    const href = await page
      .locator('link[rel="manifest"]')
      .getAttribute('href');
    const manifest = await page.evaluate(
      async (url) => (await fetch(url as string)).json(),
      href,
    );
    const appRoot = new URL('./', new URL(href!, page.url())).pathname;
    expect(manifest.scope).toBe(appRoot);
    expect(manifest.start_url).toBe(appRoot);
  });
});

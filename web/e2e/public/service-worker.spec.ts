import { expect, test } from '../fixture';

// What sw.test.ts cannot reach from source: registration, scope, cache, offline.
test.use({ locale: 'en-GB' });

const SHELL_CACHE = 'collectionbuddy-shell-v1';

type Page = import('@playwright/test').Page;

/** Controlling the page, not merely registered -- an uncontrolled page's
 *  requests never reach the fetch handler at all. */
async function waitForController(page: Page) {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

/** Every URL the worker has put in its cache. */
function cachedUrls(page: Page) {
  return page.evaluate(async (cacheName) => {
    const cache = await caches.open(cacheName);
    return (await cache.keys()).map((request) => request.url);
  }, SHELL_CACHE);
}

test.describe('the service worker', () => {
  test('registers itself under the path the app is served from', async ({
    page,
    baseURL,
  }) => {
    await page.goto('login/');
    await waitForController(page);

    const registration = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return { scope: reg.scope, scriptURL: reg.active!.scriptURL };
    });

    // A scope at the origin root is refused on a subdirectory host.
    expect(registration.scope).toBe(baseURL);
    expect(registration.scriptURL).toBe(new URL('sw.js', baseURL).toString());
  });

  // skipWaiting + clients.claim: otherwise no worker until the next visit.
  test('takes over the page that registered it, without a reload', async ({
    on,
    page,
  }) => {
    await page.goto('login/');
    await waitForController(page);
    await expect(on(page).login.locators.buttons.signIn).toBeVisible();
  });

  test('keeps the hashed bundle, and nothing from anywhere else', async ({
    page,
  }) => {
    await page.goto('login/', { waitUntil: 'networkidle' });
    await waitForController(page);
    // The first visit predates the worker, so this reload fills the cache.
    await page.reload({ waitUntil: 'networkidle' });

    const urls = await cachedUrls(page);
    expect(urls.some((url) => url.includes('/_next/static/'))).toBe(true);

    const origin = new URL(page.url()).origin;
    const shell = new URL('./', page.url()).toString();
    // The manifest is cached with the shell (sw.ts's `isShellRequest`); whether it is there yet is a race the test must not depend on.
    const unexpected = urls.filter(
      (url) =>
        new URL(url).origin !== origin ||
        !(
          url.includes('/_next/static/') ||
          url.startsWith(shell) ||
          url.endsWith('/site.webmanifest')
        ),
    );
    expect(unexpected, 'cached beyond the static bundle and the shell').toEqual(
      [],
    );

    // The activate handler drops every cache but the current one.
    expect(await page.evaluate(() => caches.keys())).toEqual([SHELL_CACHE]);
  });

  // Why the worker exists: no cache headers from the host, no connection here.
  test('still opens the app with the network gone', async ({
    on,
    page,
    context,
  }) => {
    await page.goto('login/', { waitUntil: 'networkidle' });
    await waitForController(page);
    await page.reload({ waitUntil: 'networkidle' });

    await context.setOffline(true);
    try {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(on(page).login.locators.buttons.signIn).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });
});

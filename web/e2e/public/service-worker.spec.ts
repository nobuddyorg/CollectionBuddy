import { expect, test } from '../fixture';

// What sw.test.ts cannot reach from source: registration, scope, cache, offline.
test.use({ locale: 'en-GB' });

type Page = import('@playwright/test').Page;

/** Controlling, not merely registered: an uncontrolled page's requests never reach the fetch handler. */
async function waitForController(page: Page) {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

/** The cache of the build that registered the active worker (sw.js names it after `?build=`). */
function currentCacheName(page: Page) {
  return page.evaluate(async () => {
    const { active } = await navigator.serviceWorker.ready;
    return `collectionbuddy-${new URL(active!.scriptURL).searchParams.get('build')}`;
  });
}

/** Every URL the worker has put in its cache. */
async function cachedUrls(page: Page) {
  const cacheName = await currentCacheName(page);
  return page.evaluate(async (name) => {
    const cache = await caches.open(name);
    return (await cache.keys()).map((request) => request.url);
  }, cacheName);
}

function cacheNames(page: Page) {
  return page.evaluate(() => caches.keys());
}

test.describe('the service worker', () => {
  test('registers itself under the path the app is served from', async ({
    page,
    baseURL,
  }) => {
    await page.goto('login/');
    await waitForController(page);

    const registration = await page.evaluate(async () => {
      const ready = await navigator.serviceWorker.ready;
      return { scope: ready.scope, scriptURL: ready.active!.scriptURL };
    });

    // A scope at the origin root is refused on a subdirectory host.
    expect(registration.scope).toBe(baseURL);
    const scriptURL = new URL(registration.scriptURL);
    expect(`${scriptURL.origin}${scriptURL.pathname}`).toBe(
      new URL('sw.js', baseURL).toString(),
    );
    // The build is what gives each deploy a worker, and a cache, of its own.
    expect(scriptURL.searchParams.get('build')).toMatch(/^[\w-]{8,}$/);
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
    // Whether the manifest (cached with the shell) is there yet is a race the test must not depend on.
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
    expect(await cacheNames(page)).toEqual([await currentCacheName(page)]);
  });

  // A cached shell from before a deploy would load chunks the deploy removed from the server.
  test('opens the page the server has now, not the one it cached', async ({
    on,
    page,
  }) => {
    await page.goto('login/', { waitUntil: 'networkidle' });
    await waitForController(page);
    // The first visit predates the worker, so this reload caches the shell.
    await page.reload({ waitUntil: 'networkidle' });
    const replaced = await page.evaluate(async () => {
      let count = 0;
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        if (!(await cache.match(location.href))) continue;
        await cache.put(
          location.href,
          new Response('<!doctype html><title>old build</title>', {
            headers: { 'Content-Type': 'text/html' },
          }),
        );
        count += 1;
      }
      return count;
    });
    expect(replaced).toBe(1);

    await page.reload({ waitUntil: 'domcontentloaded' });

    await expect(on(page).login.locators.buttons.signIn).toBeVisible();
  });

  test("a new build's worker deletes the old builds' caches, and only those", async ({
    page,
    baseURL,
  }) => {
    await page.goto('login/', { waitUntil: 'networkidle' });
    await waitForController(page);
    await page.reload({ waitUntil: 'networkidle' });
    const previous = await currentCacheName(page);
    await page.evaluate(async () => {
      await caches.open('collectionbuddy-shell-v1');
      await caches.open('another-site-on-this-origin');
    });

    await page.evaluate(async (scope) => {
      await navigator.serviceWorker.register(
        new URL('sw.js?build=e2e-next', scope).toString(),
        { scope },
      );
    }, baseURL!);

    await expect.poll(() => cacheNames(page)).not.toContain(previous);
    const remaining = await cacheNames(page);
    expect(remaining).not.toContain('collectionbuddy-shell-v1');
    expect(remaining).toContain('another-site-on-this-origin');
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

import { expect, test } from '../fixture';

import { collectPageProblems, expectNoPageProblems } from '../helpers';

test.use({ locale: 'en-GB' });

// A green `next build` can't catch this: prerendering runs in Node with real
// env vars, which papers over client code that only breaks as a browser bundle.
test.describe('the deployed bundle', () => {
  test('loads without throwing', async ({ page }) => {
    const problems = collectPageProblems(page);
    await page.goto('', { waitUntil: 'networkidle' });
    await expect(page).toHaveTitle(/CollectionBuddy/);
    expectNoPageProblems(problems);
  });

  // A chunk or font missing under a wrong base path 404s without throwing.
  test('asks for nothing the host cannot serve', async ({ page }) => {
    const refused: string[] = [];
    page.on('response', (response) => {
      if (response.status() >= 400) {
        refused.push(`${response.status()} ${response.url()}`);
      }
    });

    await page.goto('login/', { waitUntil: 'networkidle' });
    expect(refused, 'requests the host refused').toEqual([]);
  });

  // No server redirect exists: the root page itself checks for a session and
  // routes away. If that ever broke, a signed-out visitor would be stuck on an
  // empty catalogue waiting for entries that need a session to fetch.
  test('sends a signed-out visitor to the login page', async ({ page }) => {
    await page.goto('', { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/login\/?$/);
  });

  test('serves the login page directly, too', async ({ on, page }) => {
    const problems = collectPageProblems(page);
    await on(page).login.do.open();
    await expect(on(page).login.locators.buttons.signIn).toBeVisible();
    expectNoPageProblems(problems);
  });

  // Must be the app's own 404 page, not a stack trace or a blank document.
  test('has something to say about a path that does not exist', async ({
    page,
  }) => {
    const response = await page.goto('no-such-page/', {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status()).toBeGreaterThanOrEqual(400);
    await expect(page.locator('body')).not.toBeEmpty();
  });

  // The 404 document the export ships, opened directly -- the harness above
  // answers with its own instead of this one.
  test('ships a not-found page that is still the app', async ({ page }) => {
    const problems = collectPageProblems(page);
    await page.goto('404.html', { waitUntil: 'networkidle' });

    await expect(page.locator('body')).toContainText('404');
    // Rendered in the app's own layout, not as a bare error document.
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
    // A cold entry point, so the head scripts have to run here too.
    expect(
      await page.evaluate(() =>
        document.documentElement.getAttribute('data-theme'),
      ),
    ).toMatch(/^(light|dark)$/);
    await expect(page.locator('html')).toHaveAttribute('lang', /^(de|en)$/);

    expectNoPageProblems(problems);
  });
});

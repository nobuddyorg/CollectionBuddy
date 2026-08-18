import { expect, test } from '@playwright/test';

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

  // No server redirect exists: the root page itself checks for a session and
  // routes away. If that ever broke, a signed-out visitor would be stuck on an
  // empty catalogue waiting for entries that need a session to fetch.
  test('sends a signed-out visitor to the login page', async ({ page }) => {
    await page.goto('', { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/login\/?$/);
  });

  test('serves the login page directly, too', async ({ page }) => {
    const problems = collectPageProblems(page);
    await page.goto('login/', { waitUntil: 'networkidle' });
    await expect(
      page.getByRole('button', { name: /sign in with google/i }),
    ).toBeVisible();
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
});

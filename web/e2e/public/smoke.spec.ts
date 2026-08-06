import { expect, test } from '@playwright/test';

import { collectPageProblems, expectNoPageProblems } from '../helpers';

// The sign-in button is named in whatever language the app picked, so the
// locale is pinned rather than inherited from whoever is running this.
test.use({ locale: 'en-GB' });

// What the old scripts/smoke-check.mjs did, kept because it is the check that
// a green `next build` cannot make: prerendering runs in Node with real env
// vars, which papers over client code that only breaks once it is a bundle in
// a browser with no Node underneath.
test.describe('the deployed bundle', () => {
  test('loads without throwing', async ({ page }) => {
    const problems = collectPageProblems(page);
    await page.goto('', { waitUntil: 'networkidle' });
    await expect(page).toHaveTitle(/CollectionBuddy/);
    expectNoPageProblems(problems);
  });

  // Not a redirect served by anything: the root page renders, finds no
  // session, and routes itself. If it ever stopped doing that, a signed-out
  // visitor would sit on an empty catalogue waiting for entries that need a
  // session to fetch.
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

  // A static export answers any unknown path with its 404 page; what matters
  // is that it is *the app's* 404 and not a stack trace or a blank document.
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

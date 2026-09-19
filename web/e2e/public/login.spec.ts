import { expect, test } from '../coverage';

import { horizontalOverflow } from '../helpers';

// Pinned so the assertions below can name what is on screen; language
// selection itself is covered separately in i18n.spec.ts.
test.use({ locale: 'en-GB' });

test.describe('the login page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('login/', { waitUntil: 'networkidle' });
  });

  test('shows the wordmark in two parts', async ({ page }) => {
    const wordmark = page.getByRole('heading', { level: 1 });
    await expect(wordmark).toHaveText('CollectionBuddy');
    // Two spans: "Buddy" carries the accent colour, "Collection" the rule beneath it.
    await expect(wordmark.locator('span')).not.toHaveCount(0);
  });

  test('offers a way in', async ({ page }) => {
    const signIn = page.getByRole('button', { name: /sign in with google/i });
    await expect(signIn).toBeVisible();
    await expect(signIn).toBeEnabled();
  });

  test('puts the sign-in button in reach of the keyboard', async ({ page }) => {
    const signIn = page.getByRole('button', { name: /sign in with google/i });
    await signIn.focus();
    await expect(signIn).toBeFocused();
  });

  test('draws the medallion', async ({ page }) => {
    await expect(page.locator('svg').first()).toBeVisible();
  });

  // Checks opacity, not just count: an animated element can render but never
  // actually arrive on screen after a refactor.
  test('flies the collectibles out where there is room for them', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1000, height: 900 });
    await page.reload({ waitUntil: 'networkidle' });
    const chips = page.locator('.collectible-bob');
    expect(await chips.count()).toBeGreaterThan(0);
    await expect(chips.first()).toBeVisible();
    await expect(chips.first()).toHaveCSS('opacity', '1');
  });

  test('leaves them off a phone, where they would sit on the button', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'networkidle' });
    // Still in the markup -- CSS hides them, so assert hidden, not absent.
    await expect(page.locator('.collectible-bob').first()).toBeHidden();
    await expect(
      page.getByRole('button', { name: /sign in with google/i }),
    ).toBeVisible();
  });

  test('does not scroll sideways', async ({ page }) => {
    const { scrollWidth, clientWidth } = await horizontalOverflow(page);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test('keeps the Google button on its own white plate', async ({ page }) => {
    const signIn = page.getByRole('button', { name: /sign in with google/i });
    await expect(signIn).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  });

  // `redirect_to` is built from the base path baked in at build time, so a
  // wrong one lands every returning visitor on a 404 of the host's.
  test('hands sign-in to the provider, pointed back at the app', async ({
    page,
    baseURL,
  }) => {
    let authorizeUrl: string | undefined;
    // Intercepted, never followed: this suite also runs against production.
    await page.route('**/auth/v1/authorize*', async (route) => {
      authorizeUrl = route.request().url();
      await route.fulfill({ contentType: 'text/html', body: '<html></html>' });
    });

    await page.getByRole('button', { name: /sign in with google/i }).click();
    await expect.poll(() => authorizeUrl).toBeTruthy();

    const query = new URL(authorizeUrl!).searchParams;
    expect(query.get('provider')).toBe('google');

    const app = new URL(baseURL!);
    const back = new URL(query.get('redirect_to')!);
    expect(back.origin).toBe(app.origin);
    // Normalised: the app root carries a trailing slash here, not there.
    expect(`${back.pathname.replace(/\/$/, '')}/`).toBe(app.pathname);
  });
});

import { expect, test } from '../fixture';

import { horizontalOverflow } from '../helpers';

// Pinned so the assertions can name what is on screen; i18n.spec.ts covers language selection.
test.use({ locale: 'en-GB' });

test.describe('the login page', () => {
  test.beforeEach(async ({ on, page }) => {
    await on(page).login.do.open();
  });

  test('shows the wordmark in two parts', async ({ on, page }) => {
    const { wordmark, wordmarkParts } = on(page).login.locators;
    await expect(wordmark).toHaveText('CollectionBuddy');
    await expect(wordmarkParts).not.toHaveCount(0);
  });

  test('offers a way in', async ({ on, page }) => {
    const signIn = on(page).login.locators.buttons.signIn;
    await expect(signIn).toBeVisible();
    await expect(signIn).toBeEnabled();
  });

  test('puts the sign-in button in reach of the keyboard', async ({
    on,
    page,
  }) => {
    const signIn = on(page).login.locators.buttons.signIn;
    await signIn.focus();
    await expect(signIn).toBeFocused();
  });

  test('draws the medallion', async ({ on, page }) => {
    await expect(on(page).login.locators.coin).toBeVisible();
  });

  // Opacity, not just count: an animated element can render but never arrive on screen.
  test('flies the collectibles out where there is room for them', async ({
    on,
    page,
  }) => {
    await page.setViewportSize({ width: 1000, height: 900 });
    await page.reload({ waitUntil: 'networkidle' });
    const chips = on(page).login.locators.collectibles;
    expect(await chips.count()).toBeGreaterThan(0);
    await expect(chips.first()).toBeVisible();
    await expect(chips.first()).toHaveCSS('opacity', '1');
  });

  test('leaves them off a phone, where they would sit on the button', async ({
    on,
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'networkidle' });
    // Still in the markup -- CSS hides them, so assert hidden, not absent.
    await expect(on(page).login.locators.collectibles.first()).toBeHidden();
    await expect(on(page).login.locators.buttons.signIn).toBeVisible();
  });

  test('does not scroll sideways', async ({ page }) => {
    const { scrollWidth, clientWidth } = await horizontalOverflow(page);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test('keeps the Google button on its own white plate', async ({
    on,
    page,
  }) => {
    await expect(on(page).login.locators.buttons.signIn).toHaveCSS(
      'background-color',
      'rgb(255, 255, 255)',
    );
  });

  // redirect_to is built from the base path baked in at build time; a wrong one lands every return on a 404.
  test('hands sign-in to the provider, pointed back at the app', async ({
    on,
    page,
    baseURL,
  }) => {
    let authorizeUrl: string | undefined;
    // Intercepted, never followed: this suite also runs against production.
    await page.route('**/auth/v1/authorize*', async (route) => {
      authorizeUrl = route.request().url();
      await route.fulfill({ contentType: 'text/html', body: '<html></html>' });
    });

    await on(page).login.do.signIn();
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

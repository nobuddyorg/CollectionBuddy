import { expect, test } from '@playwright/test';

import { horizontalOverflow } from '../helpers';

// The only page a signed-out visitor can reach, and so the only page these
// runs can hold to account. It is also the one that has to work perfectly:
// everyone arrives here first, and there is no second chance at it.
// Pinned so the assertions below can name what is on screen. The app picks
// its language from the browser, and a runner's locale is not something to
// depend on -- i18n.spec.ts is where the picking itself is tested.
test.use({ locale: 'en-GB' });

test.describe('the login page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('login/', { waitUntil: 'networkidle' });
  });

  test('shows the wordmark in two parts', async ({ page }) => {
    const wordmark = page.getByRole('heading', { level: 1 });
    await expect(wordmark).toHaveText('CollectionBuddy');
    // Two spans, not one word: "Buddy" carries the accent colour and
    // "Collection" the rule beneath it.
    await expect(wordmark.locator('span')).not.toHaveCount(0);
  });

  test('offers a way in', async ({ page }) => {
    const signIn = page.getByRole('button', { name: /sign in with google/i });
    await expect(signIn).toBeVisible();
    await expect(signIn).toBeEnabled();
  });

  // Reachable without a mouse, and visibly focused when it is reached -- the
  // button is the page's only action, so losing it to the keyboard loses the
  // app.
  test('puts the sign-in button in reach of the keyboard', async ({ page }) => {
    const signIn = page.getByRole('button', { name: /sign in with google/i });
    await signIn.focus();
    await expect(signIn).toBeFocused();
  });

  test('draws the medallion', async ({ page }) => {
    await expect(page.locator('svg').first()).toBeVisible();
  });

  // The chips fly out from the rim and then drift. Animated, and so exactly
  // the sort of thing that survives a refactor as an element which renders
  // but never arrives -- hence the opacity, not merely the count.
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

  // Deliberate, not a casualty of the breakpoint: below `sm` the medallion is
  // most of the screen, and chips drifting around it would land on the one
  // button the page exists for.
  test('leaves them off a phone, where they would sit on the button', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'networkidle' });
    // Still in the markup -- the breakpoint hides them rather than dropping
    // them, so what is asserted is that nothing is drawn, not that nothing
    // was rendered.
    await expect(page.locator('.collectible-bob').first()).toBeHidden();
    await expect(
      page.getByRole('button', { name: /sign in with google/i }),
    ).toBeVisible();
  });

  test('does not scroll sideways', async ({ page }) => {
    const { scrollWidth, clientWidth } = await horizontalOverflow(page);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  // The button is Google-branded and must stay legible on its own white
  // surface whatever the page behind it is doing.
  test('keeps the Google button on its own white plate', async ({ page }) => {
    const signIn = page.getByRole('button', { name: /sign in with google/i });
    await expect(signIn).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  });
});

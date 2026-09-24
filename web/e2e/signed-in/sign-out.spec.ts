import { expect, test } from './test';

// Revoking the refresh token leaves other specs' still-valid access tokens (JWTs) undisturbed.
test.use({ locale: 'en-GB' });

test.describe('signing out', () => {
  test('returns to the login page and does not restore the catalogue on reload', async ({
    on,
    page,
  }) => {
    await page.goto('', { waitUntil: 'networkidle' });
    await expect(on(page).categories.locators.selected).not.toBeEmpty();

    await on(page).account.do.open();
    await on(page).account.do.signOut();

    await expect(page).toHaveURL(/\/login\/?$/);

    // Confirms the session itself is gone, not just a client-side navigation.
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/login\/?$/);
  });
});

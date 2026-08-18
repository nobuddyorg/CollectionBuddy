import { expect, test } from './test';

// The one signed-in spec that calls the real signOut. It revokes the shared
// user's refresh token server-side, but every other spec's browser context
// holds its own copy of the still-valid access token (a JWT verified by
// signature, not looked up against a session table), so this has nothing to
// disturb elsewhere in the same run.
test.use({ locale: 'en-GB' });

test.describe('signing out', () => {
  test('returns to the login page and does not restore the catalogue on reload', async ({
    page,
  }) => {
    await page.goto('', { waitUntil: 'networkidle' });
    await expect(page.getByTestId('selected-category')).not.toBeEmpty();

    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();

    await expect(page).toHaveURL(/\/login\/?$/);

    // Confirms the session itself is gone, not just a client-side navigation.
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/login\/?$/);
  });
});

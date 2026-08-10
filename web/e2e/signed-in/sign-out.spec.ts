import { expect, test } from './test';

// #340: onAuthStateChange's null path -- sign-out and token expiry -- is
// the only thing that catches a session going stale, and had no e2e
// journey at all: nothing here ever signed out through the interface.
//
// This is the one signed-in spec that calls the real signOut. It revokes
// the shared user's refresh token server-side, but every other spec's
// browser context already holds its own copy of the still-valid access
// token from AUTH_STATE_PATH -- a JWT verified by signature, not looked up
// against a session table -- so this has nothing to disturb elsewhere in
// the same run.
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

    // Not just a client-side navigation: the session that would have let a
    // reload skip straight back to the catalogue is actually gone.
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/login\/?$/);
  });
});

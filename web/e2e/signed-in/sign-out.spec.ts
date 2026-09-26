import { expect, test } from './test';

import { SEED } from './fixtures';
import { apiAs, context } from './rls/helpers';

// Revoking the refresh token leaves other specs' still-valid access tokens (JWTs) undisturbed.
test.use({ locale: 'en-GB' });

const uniqueTitle = (what: string) => `${what} ${Date.now()}`;

test.describe('signing out', () => {
  // One test: the global sign-out revokes the shared session, so a second one here would be refused.
  test('sends a deletion still inside its undo window, returns to the login page, and stays signed out', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const title = uniqueTitle('Vor dem Abmelden');
    const owner = apiAs(context().token);
    try {
      await app.categories.do.open(SEED.signOutCategory);
      await app.catalogue.do.addEntry(title);
      await app.catalogue.do.removeEntry(title);

      await app.account.do.open();
      await app.account.do.signOut();
      await expect(page).toHaveURL(/\/login\/?$/);

      // Left to its timer, the delete would run signed out, fail, and leave the entry standing.
      const { data, error } = await owner
        .from('items')
        .select('id')
        .eq('title', title);
      if (error) throw error;
      expect(data).toEqual([]);

      // Confirms the session itself is gone, not just a client-side navigation.
      await page.reload({ waitUntil: 'networkidle' });
      await expect(page).toHaveURL(/\/login\/?$/);
    } finally {
      await owner.from('items').delete().eq('title', title);
    }
  });
});

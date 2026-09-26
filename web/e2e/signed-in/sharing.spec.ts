import { expect, test } from './test';

import { SEED } from './fixtures';
import { apiAs, context } from './rls/helpers';
// The owner's half, through the panel; rls/viewer-share.spec.ts has what a grant opens.
test.use({ locale: 'en-GB' });

/** Whether the second collector's own token can read the owner's category, i.e. whether a grant is live. */
async function granteeSees(category: string) {
  const { data, error } = await apiAs(context().otherToken)
    .from('categories')
    .select('id')
    .eq('user_id', context().userId)
    .eq('name', category);
  if (error) throw error;
  return data.length === 1;
}

test.describe('sharing a collection', () => {
  test.beforeEach(async ({ on, page }) => {
    const app = on(page);
    await app.categories.do.open(SEED.shareCategory);
    await app.categories.do.openPanel();
  });

  test('invites a collector, widens the grant, then revokes it', async ({
    on,
    page,
  }) => {
    const app = on(page);
    await expect(app.sharing.locators.inputs.email).toBeVisible();
    await expect(app.sharing.locators.texts.empty).toBeVisible();

    await app.sharing.do.invite(SEED.other.email);

    const row = app.sharing.row(SEED.other.email);
    await expect(row()).toBeVisible();
    await expect(row.locators.expiry).toHaveText('No expiry');
    // Cleared only once the row came back, so this says stored, not typed.
    await expect(app.sharing.locators.inputs.email).toHaveValue('');

    // Widening asks first; taking edit access back again does not.
    await app.sharing.do.toggleCanEdit(SEED.other.email);
    await expect(app.confirm.locators.message).toContainText(
      'full edit access',
    );
    await app.confirm.do.accept();
    await expect(row.locators.editorBadge).toBeVisible();

    // Undo cannot unsend the delete, so it issues the grant again, role and all.
    await app.sharing.do.revoke(SEED.other.email);
    await app.confirm.do.accept();
    await expect(app.sharing.locators.texts.empty).toBeVisible();
    await app.toast.do.undo();
    await expect(row.locators.editorBadge).toBeVisible();
    expect(await granteeSees(SEED.shareCategory)).toBe(true);

    // Sent at once: reloading straight away, inside the old undo window, no longer keeps the grant alive.
    await app.sharing.do.revoke(SEED.other.email);
    await app.confirm.do.accept();
    await expect(app.sharing.locators.texts.empty).toBeVisible();
    await page.reload();
    expect(await granteeSees(SEED.shareCategory)).toBe(false);

    await app.categories.do.open(SEED.shareCategory);
    await app.categories.do.openPanel();
    await expect(app.sharing.locators.texts.empty).toBeVisible();
    await expect(app.sharing.locators.rows).toHaveCount(0);
  });

  // The picker that sets expires_at, whose own input is deliberately sr-only.
  test('carries an expiry date, and lets it be taken off again', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const chip = app.sharing.locators.buttons.expiry;
    await expect(chip).toContainText('No expiry');

    await app.sharing.do.setExpiry('2099-12-31');
    await expect(chip).toContainText(/^Expires /);

    await app.sharing.do.clearExpiry();
    await expect(chip).toContainText('No expiry');
  });
});

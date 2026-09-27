import { expect, test } from './test';

import { SEED } from './fixtures';
import { apiAs, context, ownedCategoryId } from './rls/helpers';
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

/** The owner's grants to the second collector on the share collection, read and revoked past the interface. */
async function grantsToOther() {
  const { token, userId } = context();
  const categoryId = await ownedCategoryId({
    token,
    userId,
    name: SEED.shareCategory,
  });
  const table = () => apiAs(token).from('category_shares');
  return {
    read: () =>
      table()
        .select('expires_at')
        .eq('category_id', categoryId)
        .eq('invited_email', SEED.other.email),
    revoke: () =>
      table()
        .delete()
        .eq('category_id', categoryId)
        .eq('invited_email', SEED.other.email),
  };
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

  test('issues the grant with the expiry date it was given', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const grants = await grantsToOther();
    try {
      await app.sharing.do.setExpiry('2099-12-31');
      await app.sharing.do.invite(SEED.other.email);

      await expect(
        app.sharing.row(SEED.other.email).locators.expiry,
      ).toHaveText('Expires 31/12/2099');
      // The end of that day in the browser's own time zone, which is what the picker means.
      const endOfDay = await page.evaluate(() =>
        new Date('2099-12-31T23:59:59').toISOString(),
      );
      const { data, error } = await grants.read();
      if (error) throw error;
      expect(
        data.map((grant) => new Date(grant.expires_at!).toISOString()),
      ).toEqual([endOfDay]);
    } finally {
      const { error } = await grants.revoke();
      if (error) throw error;
    }
  });
});

// Whichever side of UTC's date line is on the other day right now, so a UTC "today" would show.
const OFF_UTC_TIMEZONE =
  new Date().getUTCHours() < 11 ? 'Pacific/Pago_Pago' : 'Pacific/Kiritimati';

test.describe('sharing a collection in German on an American browser', () => {
  test.use({ locale: 'en-US', timezoneId: OFF_UTC_TIMEZONE });

  test.beforeEach(async ({ on, page }) => {
    await page.addInitScript(() => localStorage.setItem('lang', 'de'));
    const app = on(page);
    await app.categories.do.open(SEED.shareCategory);
    await app.categories.do.openPanel();
  });

  test("starts the expiry picker at the collector's own today and dates the grant in German", async ({
    on,
    page,
  }) => {
    const app = on(page);
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: OFF_UTC_TIMEZONE,
    }).format(new Date());
    await expect(app.sharing.locators.inputs.expiry).toHaveAttribute(
      'min',
      today,
    );

    const grants = await grantsToOther();
    try {
      await app.sharing.do.setExpiry('2099-12-31');
      await expect(app.sharing.locators.buttons.expiry).toHaveText(
        'Bis 31.12.2099',
      );
      await app.sharing.do.invite(SEED.other.email);

      await expect(
        app.sharing.row(SEED.other.email).locators.expiry,
      ).toHaveText('Läuft ab am 31.12.2099');
    } finally {
      const { error } = await grants.revoke();
      if (error) throw error;
    }
  });
});

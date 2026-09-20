import { expect, test } from './test';

import { SEED } from './fixtures';
import { openCategory } from './helpers';

// The owner's half, through the panel; rls.spec.ts has what a grant opens.
test.use({ locale: 'en-GB' });

test.describe('sharing a collection', () => {
  test('invites a collector, widens the grant, then revokes it', async ({
    page,
  }) => {
    await openCategory(page, SEED.shareCategory);
    await page.getByTestId('expand-categories').click();

    const invite = page.getByLabel('Share with (email)');
    await expect(invite).toBeVisible();
    await expect(page.getByText('Not shared with anyone yet.')).toBeVisible();

    await invite.fill(SEED.other.email);
    await page.getByRole('button', { name: 'Share', exact: true }).click();

    const row = page
      .getByRole('listitem')
      .filter({ hasText: SEED.other.email });
    await expect(row).toBeVisible();
    await expect(row.getByText('No expiry')).toBeVisible();
    // Cleared only once the row came back, so this says stored, not typed.
    await expect(invite).toHaveValue('');

    // Widening asks first; taking edit access back again does not.
    // Clicked, not checked: the box follows the stored role, not the click.
    await row.getByRole('checkbox', { name: 'Can edit' }).click();
    await expect(page.getByText(/full edit access/)).toBeVisible();
    await page.getByTestId('confirm-accept').click();
    await expect(row.getByText('Editor')).toBeVisible();

    await row.getByRole('button', { name: 'Revoke' }).click();
    await page.getByTestId('confirm-accept').click();
    await expect(page.getByText('Not shared with anyone yet.')).toBeVisible();
  });

  // The expiry is a real column with a check constraint behind it
  // (rls.spec.ts asserts what an expired grant then stops opening); this
  // is the picker that sets it, whose own input is deliberately sr-only.
  test('carries an expiry date, and lets it be taken off again', async ({
    page,
  }) => {
    await openCategory(page, SEED.shareCategory);
    await page.getByTestId('expand-categories').click();

    // By title, not by its own text: a grant row carries the same "No
    // expiry" wording, and the chip's text is the thing under test.
    const chip = page.getByTitle('Expires (optional)');
    await expect(chip).toContainText('No expiry');

    await page.getByLabel('Expires (optional)').fill('2099-12-31');
    await expect(chip).toContainText(/^Expires /);

    await page.getByRole('button', { name: 'Clear expiry date' }).click();
    await expect(chip).toContainText('No expiry');
  });
});

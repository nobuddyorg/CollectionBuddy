import { expect, test } from './test';

import { SEED } from './fixtures';
import { openCategory } from './helpers';

// Deleting an entry hides it at once and defers the actual delete to the
// toast's undo window, which is the one place the interface and the
// database deliberately disagree for a few seconds. Both halves of that
// bargain are browser behaviour: the undo, and a reload landing inside the
// window not resurrecting a card the collector just watched go.
test.use({ locale: 'en-GB' });

type Page = import('@playwright/test').Page;

const uniqueTitle = (what: string) => `${what} ${Date.now()}`;

async function createEntry(page: Page, title: string) {
  await page.getByTestId('new-entry').click();
  await page.getByTestId('item-title').fill(title);
  await page.getByTestId('item-submit').click();
  const card = page.getByTestId('item-card').filter({ hasText: title });
  await expect(card).toBeVisible();
  return card;
}

async function deleteEntry(page: Page, title: string) {
  const card = page.getByTestId('item-card').filter({ hasText: title });
  if ((await card.count()) === 0) return;
  await card.getByTestId('delete-entry').click();
  await page.getByTestId('confirm-accept').click();
  await expect(card).toHaveCount(0);
}

test.describe('taking a deletion back', () => {
  test.beforeEach(async ({ page }) => {
    await openCategory(page, SEED.undoCategory);
  });

  test('puts the entry back, and it is still there after a reload', async ({
    page,
  }) => {
    const title = uniqueTitle('Doch nicht');
    try {
      const card = await createEntry(page, title);

      await card.getByTestId('delete-entry').click();
      await page.getByTestId('confirm-accept').click();
      await expect(card).toHaveCount(0);

      await page.getByRole('button', { name: 'Undo', exact: true }).click();
      await expect(card).toBeVisible();

      // The row was never deleted, so it survives a trip to the database.
      await openCategory(page, SEED.undoCategory);
      await expect(
        page.getByTestId('item-card').filter({ hasText: title }),
      ).toBeVisible();
    } finally {
      await deleteEntry(page, title);
    }
  });

  // #682: the deferred delete meant a reload inside the undo window
  // refetched a row that was still there and put the card back.
  test('stays gone when the catalogue reloads inside the undo window', async ({
    page,
  }) => {
    const title = uniqueTitle('Bleibt weg');
    try {
      const card = await createEntry(page, title);

      await card.getByTestId('delete-entry').click();
      await page.getByTestId('confirm-accept').click();
      await expect(card).toHaveCount(0);

      // A refetch of the same collection, while the delete is still
      // pending -- what clearing the search box does for real.
      await page.getByTestId('search-input').fill(title);
      await page.getByTestId('search-input').fill('');
      // Waits for that refetch to land before asking about the card, or
      // the absence below is the one from before the request went out.
      await expect(
        page.getByTestId('item-card').filter({ hasText: 'Rückgängigstück' }),
      ).toBeVisible();
      await expect(card).toHaveCount(0);
    } finally {
      await deleteEntry(page, title);
    }
  });
});

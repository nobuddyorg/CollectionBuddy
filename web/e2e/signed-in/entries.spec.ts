import { expect, test } from './test';

import { SEED } from './fixtures';
import { expectTitles, openCategory, visibleTitles } from './helpers';

// Writes are where RLS has to permit as well as forbid: a policy that stopped
// allowing an ordinary insert would fail here, and nowhere else in the suite.
test.use({ locale: 'en-GB' });

// Each test creates and removes its own entry, so the seeded collection is
// unchanged before and after and tests can run in any order.
const uniqueTitle = (what: string) => `${what} ${Date.now()}`;

async function createEntry(
  page: import('@playwright/test').Page,
  title: string,
  description?: string,
) {
  await page.getByTestId('new-entry').click();
  await page.getByTestId('item-title').fill(title);
  if (description) await page.getByTestId('item-description').fill(description);
  await page.getByTestId('item-submit').click();
  await expect(
    page.getByTestId('item-card').filter({ hasText: title }),
  ).toBeVisible();
}

async function deleteEntry(
  page: import('@playwright/test').Page,
  title: string,
) {
  const card = page.getByTestId('item-card').filter({ hasText: title });
  await card.getByTestId('delete-entry').click();
  await page.getByTestId('confirm-accept').click();
  await expect(card).toHaveCount(0);
}

test.describe('adding and removing entries', () => {
  // Its own collection: spec files run in parallel against one database, so
  // writing into a collection another file is counting would fail both at random.
  test.beforeEach(async ({ page }) => {
    await openCategory(page, SEED.scratchCategory);
  });

  test('adds an entry and puts it at the front', async ({ page }) => {
    const title = uniqueTitle('Taler');
    try {
      await createEntry(page, title);

      const titles = await visibleTitles(page);
      expect(titles[0]).toBe(title);
    } finally {
      // In `finally` so a failed assertion above doesn't leave the entry
      // behind to throw off the next test's count of the collection.
      await deleteEntry(page, title);
    }
  });

  test('keeps what was typed into it', async ({ page }) => {
    const title = uniqueTitle('Dukat');
    try {
      await createEntry(page, title, 'Geprägt in Venedig.');

      const card = page.getByTestId('item-card').filter({ hasText: title });
      await expect(card.getByText('Geprägt in Venedig.')).toBeVisible();
    } finally {
      await deleteEntry(page, title);
    }
  });

  test('finds a new entry by searching for it', async ({ page }) => {
    const title = uniqueTitle('Dublone');
    try {
      await createEntry(page, title);

      await page.getByTestId('search-input').fill(title);
      await expectTitles(page, [title]);

      await page.getByTestId('search-input').fill('');
    } finally {
      await deleteEntry(page, title);
    }
  });

  test('leaves the entry alone when the deletion is cancelled', async ({
    page,
  }) => {
    const title = uniqueTitle('Sesterz');
    try {
      await createEntry(page, title);

      const card = page.getByTestId('item-card').filter({ hasText: title });
      await card.getByTestId('delete-entry').click();
      await page.getByTestId('confirm-cancel').click();
      await expect(card).toBeVisible();
    } finally {
      await deleteEntry(page, title);
    }
  });

  test('edits an entry in place', async ({ page }) => {
    const title = uniqueTitle('Groschen');
    const renamed = `${title} (renamed)`;
    // Tracks the entry's current title, so cleanup deletes the right card
    // whether the rename below ran or not.
    let currentTitle = title;
    try {
      await createEntry(page, title);

      const card = page.getByTestId('item-card').filter({ hasText: title });
      await card.getByTestId('edit-entry').click();
      await page.getByTestId('item-title').fill(renamed);
      await page.getByTestId('item-submit').click();

      await expect(
        page.getByTestId('item-card').filter({ hasText: renamed }),
      ).toBeVisible();
      currentTitle = renamed;
    } finally {
      await deleteEntry(page, currentTitle);
    }
  });

  // The database trims/collapses whitespace on write, and the app merges
  // back the returned row rather than guessing what was stored.
  test('stores a title as the database normalises it', async ({ page }) => {
    const title = uniqueTitle('Batzen');
    try {
      await createEntry(page, `   ${title}   `);

      const card = page.getByTestId('item-card').filter({ hasText: title });
      await expect(card.getByRole('heading', { level: 3 })).toHaveText(title);
    } finally {
      await deleteEntry(page, title);
    }
  });
});

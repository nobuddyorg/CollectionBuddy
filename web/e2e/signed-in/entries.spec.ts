import { expect, test } from './test';

import { SEED } from './fixtures';
import { expectTitles, openCategory, visibleTitles } from './helpers';

// Writes, which is where row-level security has to permit as well as forbid.
// Everything here goes through the app's own forms against a real database:
// a policy that stopped allowing an ordinary insert would fail here, and
// nowhere else in the suite.
test.use({ locale: 'en-GB' });

// Each test makes its own entry and takes it away again, so the seeded
// collection is the same before and after and the tests do not have to run in
// any particular order.
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
  // Its own collection, because spec files run in parallel against one
  // database: creating and deleting entries in a collection another file is
  // counting would make both of them wrong at random.
  test.beforeEach(async ({ page }) => {
    await openCategory(page, SEED.scratchCategory);
  });

  test('adds an entry and puts it at the front', async ({ page }) => {
    const title = uniqueTitle('Taler');
    await createEntry(page, title);

    // Newest first, so a new entry belongs at the top of the first page.
    const titles = await visibleTitles(page);
    expect(titles[0]).toBe(title);

    await deleteEntry(page, title);
  });

  test('keeps what was typed into it', async ({ page }) => {
    const title = uniqueTitle('Dukat');
    await createEntry(page, title, 'Geprägt in Venedig.');

    const card = page.getByTestId('item-card').filter({ hasText: title });
    await expect(card.getByText('Geprägt in Venedig.')).toBeVisible();

    await deleteEntry(page, title);
  });

  test('finds a new entry by searching for it', async ({ page }) => {
    const title = uniqueTitle('Dublone');
    await createEntry(page, title);

    await page.getByTestId('search-input').fill(title);
    await expectTitles(page, [title]);

    await page.getByTestId('search-input').fill('');
    await deleteEntry(page, title);
  });

  // Confirmation defaults to cancel, and cancelling has to mean it: a
  // delete dialog that removes the entry anyway is the worst kind of bug in
  // an app whose whole purpose is keeping things.
  test('leaves the entry alone when the deletion is cancelled', async ({
    page,
  }) => {
    const title = uniqueTitle('Sesterz');
    await createEntry(page, title);

    const card = page.getByTestId('item-card').filter({ hasText: title });
    await card.getByTestId('delete-entry').click();
    await page.getByTestId('confirm-cancel').click();
    await expect(card).toBeVisible();

    await deleteEntry(page, title);
  });

  test('edits an entry in place', async ({ page }) => {
    const title = uniqueTitle('Groschen');
    const renamed = `${title} (renamed)`;
    await createEntry(page, title);

    const card = page.getByTestId('item-card').filter({ hasText: title });
    await card.getByTestId('edit-entry').click();
    await page.getByTestId('item-title').fill(renamed);
    await page.getByTestId('item-submit').click();

    await expect(
      page.getByTestId('item-card').filter({ hasText: renamed }),
    ).toBeVisible();

    await deleteEntry(page, renamed);
  });

  // The database is the normalization authority -- it trims and collapses
  // whitespace on write, and the app merges back the row it returns rather
  // than a client-side guess at what was stored.
  test('stores a title as the database normalises it', async ({ page }) => {
    const title = uniqueTitle('Batzen');
    await createEntry(page, `   ${title}   `);

    const card = page.getByTestId('item-card').filter({ hasText: title });
    await expect(card.getByRole('heading', { level: 3 })).toHaveText(title);

    await deleteEntry(page, title);
  });
});

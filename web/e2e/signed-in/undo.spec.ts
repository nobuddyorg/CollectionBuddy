import { expect, test } from './test';

import { SEED } from './fixtures';
import type { PageTree } from '../pages';
// The undo window is the one place the interface and the database deliberately disagree for a while.
test.use({ locale: 'en-GB' });

const uniqueTitle = (what: string) => `${what} ${Date.now()}`;

/** Cleanup, so it has to cope with the entry already being gone. */
async function deleteIfPresent(app: PageTree, title: string) {
  const card = app.catalogue.card(title);
  if ((await card().count()) === 0) return;
  await app.catalogue.do.removeEntry(title);
}

test.describe('taking a deletion back', () => {
  test.beforeEach(async ({ on, page }) => {
    await on(page).categories.do.open(SEED.undoCategory);
  });

  test('puts the entry back, and it is still there after a reload', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const title = uniqueTitle('Doch nicht');
    try {
      await app.catalogue.do.addEntry(title);
      await app.catalogue.do.removeEntry(title);

      await app.toast.do.undo();
      await expect(app.catalogue.card(title)()).toBeVisible();

      // The row was never deleted, so it survives a trip to the database.
      await app.categories.do.open(SEED.undoCategory);
      await expect(app.catalogue.card(title)()).toBeVisible();
    } finally {
      await deleteIfPresent(app, title);
    }
  });

  // A refetch inside the undo window finds the row still there and must not put the card back.
  test('stays gone when the catalogue reloads inside the undo window', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const title = uniqueTitle('Bleibt weg');
    try {
      await app.catalogue.do.addEntry(title);
      await app.catalogue.do.removeEntry(title);

      // Clearing the search box refetches the collection while the delete is still pending.
      await app.catalogue.do.search(title);
      await app.catalogue.do.search('');
      // Waits for that refetch to land, or the absence below predates the request.
      await expect(app.catalogue.card('Rückgängigstück')()).toBeVisible();
      await expect(app.catalogue.card(title)()).toHaveCount(0);
    } finally {
      await deleteIfPresent(app, title);
    }
  });
});

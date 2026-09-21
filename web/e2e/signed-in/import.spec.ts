import { expect, test } from './test';

import { SEED, itemsIn } from './fixtures';
import { expectTitles } from './helpers';
import type { PageTree } from '../pages';

// The half fake I/O cannot reach: a real download, handed to a real input.
test.use({ locale: 'en-GB' });

// Two real round trips, past the 30s default under parallel load.
test.describe.configure({ timeout: 120_000 });

/** Removes a category through the panel, if it is still there to remove. */
async function removeCategory(app: PageTree, name: string) {
  await app.categories.do.openPanel();
  const tab = app.categories.tab(name);
  if ((await tab.count()) === 0) return;

  await tab.click();
  await app.categories.do.delete();
  await app.confirm.do.accept();
  await expect(app.categories.locators.selected).not.toHaveText(name);
}

test.describe('importing an exported archive', () => {
  test('reads a collection back as a copy beside the original', async ({
    on,
    page,
  }) => {
    const app = on(page);
    await app.categories.do.open(SEED.importCategory);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      app.categories.do.exportCollection(),
    ]);
    const archive = await download.path();
    if (!archive) throw new Error('the export did not save a file to disk');

    // Named the way a filesystem names a second copy, never overwriting.
    const copy = `${SEED.importCategory} (2)`;
    try {
      await app.categories.do.importArchive(archive);

      // Importing selects the new collection, which collapses the panel.
      await expect(app.categories.locators.selected).toHaveText(copy, {
        timeout: 60_000,
      });
      await expectTitles(
        page,
        itemsIn(SEED.importCategory).map((item) => item.title),
      );

      // Not just the titles: an entry arrives with what was around it.
      const card = app.catalogue.card('Umzugsstück');
      await expect(card.locators.place).toHaveText('Bremen');
      await expect(card.locators.tags).toHaveText(['umzug']);
    } finally {
      // In `finally`, so a failed assertion leaves no copy for the next run.
      await removeCategory(app, copy);
    }
  });
});

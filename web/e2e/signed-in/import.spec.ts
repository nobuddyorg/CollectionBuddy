import { resolve } from 'node:path';

import { expect, test } from './test';

import { SEED, itemsIn } from './fixtures';
import { expectTitles } from './helpers';
import type { PageTree } from '../pages';

// The half fake I/O cannot reach: a real download, handed to a real input.
test.use({ locale: 'en-GB' });

// Two real round trips, past the 30s default under parallel load.
test.describe.configure({ timeout: 120_000 });
const ARRIVES = 45_000;

const PHOTO = resolve(process.cwd(), 'public/logo.png');

/** Removes a category through the panel, if it is still there to remove. */
async function removeCategory(app: PageTree, name: string) {
  await app.categories.do.openPanel();
  const tab = app.categories.tab(name);
  if ((await tab.count()) === 0) return;

  await tab.click();
  await app.categories.do.delete();
  await app.confirm.do.accept();
  await expect(app.categories.locators.selected).not.toHaveText(name);
  // Ends the undo window now, so the next import numbers its copy from a clean slate.
  await app.toast.do.close();
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

  // The archive carries only the full-size file; the import compresses a new thumbnail and uploads both under the importer's own prefix.
  test('brings a photograph back with its entry', async ({ on, page }) => {
    const app = on(page);
    await app.categories.do.open(SEED.importCategory);

    const title = `Fotostück ${Date.now()}`;
    await app.catalogue.do.addEntry(title);
    const original = app.catalogue.card(title);
    await original.do.uploadPhoto(PHOTO);
    await expect(original.locators.images).toBeVisible({ timeout: ARRIVES });

    const copy = `${SEED.importCategory} (2)`;
    try {
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        app.categories.do.exportCollection(),
      ]);
      const archive = await download.path();
      if (!archive) throw new Error('the export did not save a file to disk');

      await app.categories.do.importArchive(archive);
      await expect(app.categories.locators.selected).toHaveText(copy, {
        timeout: 60_000,
      });
      const imported = app.catalogue.card(title);
      await expect(imported()).toBeVisible();
      await expect(imported.locators.images).toBeVisible({ timeout: ARRIVES });
      await expect(imported.locators.images).toHaveAttribute('src', /token=/);
    } finally {
      await removeCategory(app, copy);
      await app.categories.do.open(SEED.importCategory);
      await app.catalogue.do.removeEntry(title);
    }
  });
});

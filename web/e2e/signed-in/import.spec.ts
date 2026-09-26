import { resolve } from 'node:path';

import { expect, test } from './test';

import { SEED, itemsIn } from './fixtures';
import { expectTitles } from './helpers';
import { apiAs, context } from './rls/helpers';
import type { PageTree } from '../pages';

// The half fake I/O cannot reach: a real download, handed to a real input.
test.use({ locale: 'en-GB' });

// Two real round trips, past the 30s default under parallel load.
test.describe.configure({ timeout: 120_000 });
const ARRIVES = 45_000;

const PHOTO = resolve(process.cwd(), 'public/logo.png');
const DETAIL = resolve(process.cwd(), 'public/icon-192.png');

/** Every entry titled `title` the caller can read: the original and, after an import, its copy. */
async function itemIdsFor(token: string, title: string) {
  const { data, error } = await apiAs(token)
    .from('items')
    .select('id')
    .eq('title', title);
  if (error) throw error;
  return data.map((row) => row.id as string);
}

/** A photograph's path without its extension, which its full size and thumbnail share. */
const stem = (path: string) => path.slice(0, path.lastIndexOf('.'));

/** An entry's photographs in the order the catalogue reads them; the first is the cover. */
async function photographsOf(token: string, itemId: string) {
  const { data, error } = await apiAs(token)
    .from('images')
    .select('size_bytes, path_full')
    .eq('item_id', itemId)
    .order('created_at')
    .order('id');
  if (error) throw error;
  return data as { size_bytes: number; path_full: string }[];
}

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

  // The archive carries only the full-size file; the import compresses a thumbnail and uploads both.
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

  // Records the cover's row after the other's, as a large first photograph finishing last would.
  test("keeps an entry's cover photograph, whichever lands first", async ({
    on,
    page,
  }) => {
    const app = on(page);
    const { token } = context();
    await app.categories.do.open(SEED.importCategory);

    const title = `Titelbildstück ${Date.now()}`;
    await app.catalogue.do.addEntry(title);
    const original = app.catalogue.card(title);
    await original.do.uploadPhoto(PHOTO);
    await expect(original.locators.images).toHaveCount(1, { timeout: ARRIVES });
    await original.do.uploadPhoto(DETAIL);
    await expect(original.locators.images).toHaveCount(2, { timeout: ARRIVES });
    const [originalId] = await itemIdsFor(token, title);
    const sizes = (await photographsOf(token, originalId)).map(
      (photo) => photo.size_bytes,
    );
    // Sizes tell the two rows apart in flight, so they must differ.
    expect(new Set(sizes).size).toBe(2);

    const inserts = (url: URL) => url.pathname.endsWith('/rest/v1/images');
    const copy = `${SEED.importCategory} (2)`;
    try {
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        app.categories.do.exportCollection(),
      ]);
      const archive = await download.path();
      if (!archive) throw new Error('the export did not save a file to disk');

      // Gated by size, not by the first two rows: an earlier test's entry may still be in the archive.
      const [coverSize, detailSize] = sizes;
      let detailRecorded = () => {};
      const recorded = new Promise<void>(
        (resolve) => (detailRecorded = resolve),
      );
      await page.route(inserts, async (route) => {
        const request = route.request();
        if (request.method() !== 'POST') return route.fallback();
        const row = request.postDataJSON() as { size_bytes: number };
        if (row.size_bytes === coverSize) {
          await recorded;
          return route.fallback();
        }
        if (row.size_bytes !== detailSize) return route.fallback();
        await route.fulfill({ response: await route.fetch() });
        detailRecorded();
      });

      await app.categories.do.importArchive(archive);
      await expect(app.categories.locators.selected).toHaveText(copy, {
        timeout: 60_000,
      });
      const [importedId] = (await itemIdsFor(token, title)).filter(
        (id) => id !== originalId,
      );
      const photographs = await photographsOf(token, importedId);
      expect(photographs.map((photo) => photo.size_bytes)).toEqual(sizes);

      const imported = app.catalogue.card(title);
      await expect(imported.locators.images).toHaveCount(2, {
        timeout: ARRIVES,
      });
      await expect
        .poll(() => imported.locators.images.first().getAttribute('src'))
        .toContain(stem(photographs[0].path_full));
    } finally {
      await page.unroute(inserts);
      await removeCategory(app, copy);
      await app.categories.do.open(SEED.importCategory);
      await app.catalogue.do.removeEntry(title);
    }
  });

  // Objects before rows: a rollback that only dropped the category would leave the upload in the bucket.
  test('a cancelled import leaves no photograph behind', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const { token } = context();
    await app.categories.do.open(SEED.importCategory);

    const title = `Abbruchstück ${Date.now()}`;
    await app.catalogue.do.addEntry(title);
    const original = app.catalogue.card(title);
    await original.do.uploadPhoto(PHOTO);
    await expect(original.locators.images).toBeVisible({ timeout: ARRIVES });

    const uploads = '**/storage/v1/object/item-images/**';
    const copy = `${SEED.importCategory} (2)`;
    try {
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        app.categories.do.exportCollection(),
      ]);
      const archive = await download.path();
      if (!archive) throw new Error('the export did not save a file to disk');

      // Holds the import's first upload until Cancel is pressed, then lets it land.
      let release = () => {};
      const released = new Promise<void>((resolve) => (release = resolve));
      let uploadSeen: (path: string) => void = () => {};
      const firstUpload = new Promise<string>(
        (resolve) => (uploadSeen = resolve),
      );
      await page.route(uploads, async (route) => {
        uploadSeen(new URL(route.request().url()).pathname);
        await released;
        await route.continue();
      });

      await app.categories.do.importArchive(archive);
      const uploadPath = await firstUpload;
      await app.categories.do.cancelImport();
      // Waits for the object to exist, so an empty listing below means removed, not not-yet-stored.
      const landed = page.waitForResponse(
        (response) => new URL(response.url()).pathname === uploadPath,
      );
      release();
      await landed;
      await expect(app.categories.locators.buttons.cancelImport).toBeHidden({
        timeout: ARRIVES,
      });
      const [userId, itemId] = uploadPath
        .split('/storage/v1/object/item-images/')[1]
        .split('/');
      await expect
        .poll(
          async () => {
            const { data } = await apiAs(token)
              .storage.from('item-images')
              .list(`${userId}/${itemId}`);
            return data;
          },
          { timeout: 15_000 },
        )
        .toEqual([]);
      await app.categories.do.openPanel();
      await expect(app.categories.tab(copy)).toHaveCount(0);
    } finally {
      await page.unroute(uploads);
      await removeCategory(app, copy);
      await app.categories.do.open(SEED.importCategory);
      await app.catalogue.do.removeEntry(title);
    }
  });
});

import { resolve } from 'node:path';

import { expect, test } from './test';

import { repackContentsLikeZipTool, repackLikeZipTool } from './archives';
import { removeCategoryNamed, removeEntriesTitled } from './cleanup';
import { SEED, titlesIn } from './fixtures';
import { expectTitles, PHOTO, PHOTO_ARRIVES, uniqueName } from './helpers';
import { apiAs, context, storedObjects } from './rls/helpers';
import type { PageTree } from '../pages';

// The half fake I/O cannot reach: a real download, handed to a real input.
test.use({ locale: 'en-GB' });

// Two real round trips, past the 30s default under parallel load.
test.describe.configure({ timeout: 120_000 });

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

// Named the way a filesystem names a second copy, never overwriting.
const IMPORTED_COPY = `${SEED.importCategory} (2)`;

/** Importing selects the new collection, which collapses the panel. */
async function importAndAwait(app: PageTree, archive: string) {
  await app.categories.do.importArchive(archive);
  await expect(app.categories.locators.selected).toHaveText(IMPORTED_COPY, {
    timeout: 60_000,
  });
}

/** A fresh entry in the import collection, holding one stored photograph. */
async function photographedOriginal(app: PageTree, title: string) {
  await app.categories.do.open(SEED.importCategory);
  await app.catalogue.do.addEntry(title);
  const original = app.catalogue.card(title);
  await original.do.uploadPhoto(PHOTO);
  await expect(original.locators.images).toBeVisible({
    timeout: PHOTO_ARRIVES,
  });
}

test.describe('importing an exported archive', () => {
  test('reads a collection back as a copy beside the original', async ({
    on,
    page,
  }) => {
    const app = on(page);
    await app.categories.do.open(SEED.importCategory);

    const archive = await app.categories.do.downloadExport();

    try {
      await importAndAwait(app, archive);
      await expectTitles(page, titlesIn(SEED.importCategory));

      // Not just the titles: an entry arrives with what was around it.
      const card = app.catalogue.card('Umzugsstück');
      await expect(card.locators.place).toHaveText('Bremen');
      await expect(card.locators.tags).toHaveText(['umzug']);
    } finally {
      // In `finally`, so a failed assertion leaves no copy for the next test to number past.
      await removeCategoryNamed(IMPORTED_COPY);
    }
  });

  // #787: unzipped to browse the photographs, zipped again by the OS; it used to fail as "try again" every time.
  for (const { packed, repack } of [
    { packed: 'a zip tool packed again', repack: repackLikeZipTool },
    // Selecting the unzipped folder's files and zipping them leaves collection.json at the root.
    {
      packed: 'whose contents were zipped without their folder',
      repack: repackContentsLikeZipTool,
    },
  ]) {
    test(`reads an export ${packed}`, async ({ on, page }, testInfo) => {
      const app = on(page);
      const title = uniqueName('Neu gepackt');
      await photographedOriginal(app, title);

      try {
        const archive = await app.categories.do.downloadExport();
        const repacked = testInfo.outputPath('repacked.zip');
        repack(archive, repacked);

        await importAndAwait(app, repacked);
        const imported = app.catalogue.card(title);
        await expect(imported.locators.images).toBeVisible({
          timeout: PHOTO_ARRIVES,
        });
        await expect(imported.locators.images).toHaveAttribute('src', /token=/);
      } finally {
        await removeEntriesTitled(title);
        await removeCategoryNamed(IMPORTED_COPY);
      }
    });
  }

  // The archive carries only the full-size file; the import compresses a thumbnail and uploads both.
  test('brings a photograph back with its entry', async ({ on, page }) => {
    const app = on(page);
    const title = uniqueName('Fotostück');
    await photographedOriginal(app, title);

    try {
      const archive = await app.categories.do.downloadExport();

      await importAndAwait(app, archive);
      const imported = app.catalogue.card(title);
      await expect(imported()).toBeVisible();
      await expect(imported.locators.images).toBeVisible({
        timeout: PHOTO_ARRIVES,
      });
      await expect(imported.locators.images).toHaveAttribute('src', /token=/);
    } finally {
      await removeEntriesTitled(title);
      await removeCategoryNamed(IMPORTED_COPY);
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

    const title = uniqueName('Titelbildstück');
    await app.catalogue.do.addEntry(title);
    const original = app.catalogue.card(title);
    await original.do.uploadPhoto(PHOTO);
    await expect(original.locators.images).toHaveCount(1, {
      timeout: PHOTO_ARRIVES,
    });
    await original.do.uploadPhoto(DETAIL);
    await expect(original.locators.images).toHaveCount(2, {
      timeout: PHOTO_ARRIVES,
    });
    const [originalId] = await itemIdsFor(token, title);
    const sizes = (await photographsOf(token, originalId)).map(
      (photo) => photo.size_bytes,
    );
    // Sizes tell the two rows apart in flight, so they must differ.
    expect(new Set(sizes).size).toBe(2);

    const inserts = (url: URL) => url.pathname.endsWith('/rest/v1/images');
    try {
      const archive = await app.categories.do.downloadExport();

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

      await importAndAwait(app, archive);
      const [importedId] = (await itemIdsFor(token, title)).filter(
        (id) => id !== originalId,
      );
      const photographs = await photographsOf(token, importedId);
      expect(photographs.map((photo) => photo.size_bytes)).toEqual(sizes);

      const imported = app.catalogue.card(title);
      await expect(imported.locators.images).toHaveCount(2, {
        timeout: PHOTO_ARRIVES,
      });
      await expect
        .poll(() => imported.locators.images.first().getAttribute('src'))
        .toContain(stem(photographs[0].path_full));
    } finally {
      await page.unroute(inserts);
      await removeEntriesTitled(title);
      await removeCategoryNamed(IMPORTED_COPY);
    }
  });

  // Objects before rows: a rollback that only dropped the category would leave the upload in the bucket.
  test('a cancelled import leaves no photograph behind', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const { token } = context();
    const title = uniqueName('Abbruchstück');
    await photographedOriginal(app, title);

    const uploads = '**/storage/v1/object/item-images/**';
    try {
      const archive = await app.categories.do.downloadExport();

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
        timeout: PHOTO_ARRIVES,
      });
      const [userId, itemId] = uploadPath
        .split('/storage/v1/object/item-images/')[1]
        .split('/');
      await expect
        .poll(() => storedObjects(token, `${userId}/${itemId}`), {
          timeout: 15_000,
        })
        .toEqual([]);
      await app.categories.do.openPanel();
      await expect(app.categories.tab(IMPORTED_COPY)).toHaveCount(0);
    } finally {
      await page.unroute(uploads);
      await removeEntriesTitled(title);
      await removeCategoryNamed(IMPORTED_COPY);
    }
  });
});

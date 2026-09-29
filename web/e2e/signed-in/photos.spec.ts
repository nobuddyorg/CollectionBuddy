import { expect, test } from './test';

import { removeEntriesTitled } from './cleanup';
import { SEED } from './fixtures';
import { PHOTO, PHOTO_ARRIVES, uniqueName } from './helpers';
import { context, itemIdTitled, storedObjects } from './rls/helpers';
import type { PageTree } from '../pages';
// Decode, resize, upload, list and sign all happen in the browser; rls/ covers what the policies allow.
test.use({ locale: 'en-GB' });

// The default 30s does not reliably cover two real uploads under parallel load.
test.describe.configure({ timeout: 120_000 });

type StoredItem = { token: string; userId: string; itemId: string };

/** Scoped to the item, not the account: other specs write under the same owner concurrently. */
async function storedFiles(item: StoredItem) {
  const objects = await storedObjects(
    item.token,
    `${item.userId}/${item.itemId}`,
  );
  return objects.map((object) => ({
    name: object.name,
    type: (object.metadata?.mimetype ?? '') as string,
    bytes: (object.metadata?.size ?? 0) as number,
  }));
}

async function storedNames(item: StoredItem) {
  return (await storedFiles(item)).map((file) => file.name);
}

// The logo's 414x341 PNG is ~210 KB; WebP or JPEG at 80% comes in far below, a PNG re-encode does not.
const COMPRESSED_CEILING_BYTES = 100_000;

// Safari's canvas cannot encode WebP and answers with PNG (MDN browser-compat-data); the patch cannot reach into a worker.
function emulateSafariCanvas() {
  const asSafari = (type?: string) =>
    type === 'image/webp' ? 'image/png' : type;
  const toBlob = HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
    toBlob.call(this, callback, asSafari(type), quality);
  };
  const toDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function (type, quality) {
    return toDataURL.call(this, asSafari(type), quality);
  };
}

// Safari before 16.4 has no OffscreenCanvas, so the app encodes on the patched main-thread canvas instead.
function removeOffscreenCanvas() {
  Object.defineProperty(window, 'OffscreenCanvas', { value: undefined });
}

type WorkerAnswers = { photographs: number; errors: number };

// The compression worker posts back {blob}, or {error} when it cannot compress.
function countCompressionWorkerAnswers() {
  const answers: WorkerAnswers = { photographs: 0, errors: 0 };
  Object.assign(window, { compressionWorkerAnswers: answers });
  const NativeWorker = window.Worker;
  window.Worker = class extends NativeWorker {
    constructor(...args: ConstructorParameters<typeof Worker>) {
      super(...args);
      this.addEventListener('message', ({ data }) => {
        if (data?.blob) answers.photographs++;
        if (data?.error) answers.errors++;
      });
      this.addEventListener('error', () => answers.errors++);
    }
  };
}

test.describe('photographs', () => {
  test.beforeEach(async ({ on, page }) => {
    await on(page).categories.do.open(SEED.photoCategory);
  });

  test('a photograph can be added to an entry and is drawn', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const title = uniqueName('Fotografiert');
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);

      await card.do.uploadPhoto(PHOTO);

      // Waits for the real picture, not the placeholder that stood in for it.
      await expect(card.locators.images).toBeVisible({
        timeout: PHOTO_ARRIVES,
      });
      await expect(card.locators.images).toHaveAttribute('src', /token=/);
      // Both sizes signed and offered, so a plate that needs no more than 600px fetches the thumbnail.
      await expect(card.locators.images).toHaveAttribute(
        'srcset',
        /\.thumb\.\w+\?token=\S+ 600w, \S+\?token=\S+ 1000w$/,
      );
    } finally {
      await removeEntriesTitled(title);
    }
  });

  test('the photograph is still there on the next visit', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const title = uniqueName('Bleibt');
    try {
      await app.catalogue.do.addEntry(title);
      await app.catalogue.card(title).do.uploadPhoto(PHOTO);
      await expect(app.catalogue.card(title).locators.images).toBeVisible({
        timeout: PHOTO_ARRIVES,
      });

      await app.categories.do.open(SEED.photoCategory);
      await expect(app.catalogue.card(title).locators.images).toBeVisible({
        timeout: PHOTO_ARRIVES,
      });
    } finally {
      await removeEntriesTitled(title);
    }
  });

  // Both files live under the owner's prefix, the segment the storage policies key on.
  test('it is stored as a pair, under the owner', async ({ on, page }) => {
    const app = on(page);
    const { token, userId } = context();

    const title = uniqueName('Paarweise');
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);
      const itemId = await itemIdTitled(token, title);
      await card.do.uploadPhoto(PHOTO);
      await expect(card.locators.images).toBeVisible({
        timeout: PHOTO_ARRIVES,
      });

      const stored = await storedFiles({ token, userId, itemId });
      expect(stored).toHaveLength(2);
      const thumbnails = stored.filter(({ name }) => name.includes('.thumb.'));
      expect(thumbnails.map(({ name }) => name)).toEqual([
        expect.stringMatching(/\.thumb\.webp$/),
      ]);
      // The bytes are what the name says, and compressed: never a PNG under a .webp name.
      for (const file of stored) {
        expect(file.name).toMatch(/\.webp$/);
        expect(file.type).toBe('image/webp');
        expect(file.bytes).toBeLessThan(COMPRESSED_CEILING_BYTES);
      }
    } finally {
      await removeEntriesTitled(title);
    }
  });

  // A phone photograph takes seconds to compress; on the main thread that freezes the page.
  test('it is compressed off the main thread, in a worker the app serves from its own origin', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const workerUrls: string[] = [];
    page.on('worker', (worker) => workerUrls.push(worker.url()));
    await page.addInitScript(countCompressionWorkerAnswers);
    await app.categories.do.open(SEED.photoCategory);

    const title = uniqueName('Im Worker');
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);
      await card.do.uploadPhoto(PHOTO);
      await expect(card.locators.images).toBeVisible({
        timeout: PHOTO_ARRIVES,
      });

      const answers = await page.evaluate(
        () =>
          (window as unknown as { compressionWorkerAnswers: WorkerAnswers })
            .compressionWorkerAnswers,
      );
      // One worker for the full size, one for the thumbnail.
      expect(answers).toEqual({ photographs: 2, errors: 0 });
      await expect.poll(() => workerUrls).toHaveLength(2);
      const appOrigin = new URL(page.url()).origin;
      for (const workerUrl of workerUrls) {
        const { origin, pathname } = new URL(workerUrl);
        expect(origin).toBe(appOrigin);
        expect(pathname).toMatch(/\/_next\/static\/chunks\/[^/]+\.js$/);
      }
    } finally {
      await removeEntriesTitled(title);
    }
  });

  for (const { safari, emulations, workers } of [
    {
      safari: 'Safari 16.4 on, in a worker',
      emulations: [emulateSafariCanvas],
      workers: 2,
    },
    {
      safari: 'Safari before 16.4, on the main thread',
      emulations: [emulateSafariCanvas, removeOffscreenCanvas],
      workers: 0,
    },
  ]) {
    test(`where the browser cannot encode WebP, it is stored as JPEG and named so (${safari})`, async ({
      on,
      page,
    }) => {
      const app = on(page);
      const { token, userId } = context();
      const workerUrls: string[] = [];
      page.on('worker', (worker) => workerUrls.push(worker.url()));
      for (const emulation of emulations) await page.addInitScript(emulation);
      await app.categories.do.open(SEED.photoCategory);

      const title = uniqueName('Safari');
      try {
        await app.catalogue.do.addEntry(title);
        const card = app.catalogue.card(title);
        const itemId = await itemIdTitled(token, title);
        await card.do.uploadPhoto(PHOTO);
        await expect(card.locators.images).toBeVisible({
          timeout: PHOTO_ARRIVES,
        });

        await expect.poll(() => workerUrls).toHaveLength(workers);
        const stored = await storedFiles({ token, userId, itemId });
        expect(stored.map(({ name }) => name).sort()).toEqual([
          expect.stringMatching(/^[0-9a-f-]+\.jpg$/),
          expect.stringMatching(/^[0-9a-f-]+\.thumb\.jpg$/),
        ]);
        for (const file of stored) {
          expect(file.type).toBe('image/jpeg');
          expect(file.bytes).toBeLessThan(COMPRESSED_CEILING_BYTES);
        }
      } finally {
        await removeEntriesTitled(title);
      }
    });
  }

  test('a second photograph joins the first rather than replacing it', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const title = uniqueName('Zwei');
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);

      await card.do.uploadPhoto(PHOTO);
      await expect(card.locators.images).toHaveCount(1, {
        timeout: PHOTO_ARRIVES,
      });

      await card.do.uploadPhoto(PHOTO);
      await expect(card.locators.images).toHaveCount(2, {
        timeout: PHOTO_ARRIVES,
      });
    } finally {
      await removeEntriesTitled(title);
    }
  });

  // The delete is deferred to the undo window; closing the toast ends it, so the row and both objects go now.
  test('a photograph can be taken off again, and stays off', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const { token, userId } = context();

    const title = uniqueName('Wieder weg');
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);
      const itemId = await itemIdTitled(token, title);
      await card.do.uploadPhoto(PHOTO);
      await expect(card.locators.images).toBeVisible({
        timeout: PHOTO_ARRIVES,
      });

      await card.locators.buttons.deleteImage.click();
      await app.confirm.do.accept();
      await expect(card.locators.images).toHaveCount(0);
      await app.toast.do.commitDeletion('images');

      await app.categories.do.open(SEED.photoCategory);
      await expect(app.catalogue.card(title)()).toBeVisible();
      await expect(app.catalogue.card(title).locators.images).toHaveCount(0);
      await expect
        .poll(() => storedNames({ token, userId, itemId }), {
          timeout: 15_000,
        })
        .toEqual([]);
    } finally {
      await removeEntriesTitled(title);
    }
  });

  // SQL cannot reach object storage, so the app must delete photographs itself.
  test('deleting the entry takes its photographs with it', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const { token, userId } = context();

    const title = uniqueName('Mit Aufräumen');
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);
      const itemId = await itemIdTitled(token, title);
      await card.do.uploadPhoto(PHOTO);
      await expect(card.locators.images).toBeVisible({
        timeout: PHOTO_ARRIVES,
      });

      const during = await storedNames({ token, userId, itemId });
      expect(during.length).toBeGreaterThan(0);

      await app.catalogue.do.removeEntry(title);
      await app.toast.do.commitDeletion('items');
      expect(await storedNames({ token, userId, itemId })).toEqual([]);
    } finally {
      await removeEntriesTitled(title);
    }
  });

  // #784: the entry's delete can commit inside its photograph's own undo window and take the photograph along.
  test.describe('taken off just before its entry is deleted', () => {
    async function photographThenEntryDeleted(
      app: PageTree,
      title: string,
    ): Promise<string> {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);
      const itemId = await itemIdTitled(context().token, title);
      await card.do.uploadPhoto(PHOTO);
      await expect(card.locators.images).toBeVisible({
        timeout: PHOTO_ARRIVES,
      });

      await card.locators.buttons.deleteImage.click();
      await app.confirm.do.accept();
      await app.catalogue.do.removeEntry(title);
      await app.toast.do.commitDeletion('items');
      // The photograph's toast is the one still waiting; without it this test would prove nothing.
      await expect(app.toast.locators.buttons.action).toBeVisible();
      return itemId;
    }

    test('its undo has nothing to bring back, and the app carries on', async ({
      on,
      page,
    }) => {
      const app = on(page);
      const title = uniqueName('Mit Eintrag weg');
      try {
        await photographThenEntryDeleted(app, title);

        await app.toast.do.undo();

        await expect(app.toast.locators.buttons.action).toHaveCount(0);
        await expect(app.appError()).toHaveCount(0);
        await expect(app.catalogue.card(title)()).toHaveCount(0);
        await expect(app.catalogue.locators.buttons.newEntry).toBeVisible();
      } finally {
        await removeEntriesTitled(title);
      }
    });

    test('its own delete counts as done, not as failed', async ({
      on,
      page,
    }) => {
      const app = on(page);
      const title = uniqueName('Schon mitgenommen');
      try {
        const itemId = await photographThenEntryDeleted(app, title);
        // After the row delete finds nothing, the app asks whether the entry went too.
        const entryLookedUp = page.waitForResponse(
          (response) =>
            response.request().method() === 'GET' &&
            new URL(response.url()).pathname.endsWith('/rest/v1/items') &&
            new URL(response.url()).searchParams.get('id') === `eq.${itemId}`,
        );

        await app.toast.do.close();
        await entryLookedUp;

        await expect(app.toast.locators.alert).toHaveCount(0);
        await expect(app.appError()).toHaveCount(0);
        await expect(app.catalogue.card(title)()).toHaveCount(0);
      } finally {
        await removeEntriesTitled(title);
      }
    });
  });
});

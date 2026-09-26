import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test } from './test';
import { createClient } from '@supabase/supabase-js';

import { CONTEXT_PATH, SEED, type SeedContext } from './fixtures';
// Decode, resize, upload, list and sign all happen in the browser; rls/ covers what the policies allow.
test.use({ locale: 'en-GB' });

// The default 30s does not reliably cover two real uploads under parallel load.
test.describe.configure({ timeout: 120_000 });
// Below the test timeout, so a slow upload fails with its own message instead of a bare timeout.
const ARRIVES = 45_000;

// A real photograph: the compressor decodes what it is given, and a canvas cannot draw a fake PNG.
const PHOTO = resolve(process.cwd(), 'public/logo.png');

const context = () =>
  JSON.parse(readFileSync(CONTEXT_PATH, 'utf8')) as SeedContext;

function apiAs(token: string) {
  return createClient(
    process.env.E2E_SUPABASE_URL!,
    process.env.E2E_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  );
}

function storageAs(token: string) {
  return apiAs(token).storage.from('item-images');
}

/** The id of the (uniquely-titled) item a test just created through the UI. */
async function itemIdFor(token: string, title: string) {
  const { data, error } = await apiAs(token)
    .from('items')
    .select('id')
    .eq('title', title)
    .single();
  if (error) throw error;
  return data.id as string;
}

type StoredItem = { token: string; userId: string; itemId: string };

/** Scoped to the item, not the account: other specs write under the same owner concurrently. */
async function storedFiles(item: StoredItem) {
  const { data } = await storageAs(item.token).list(
    `${item.userId}/${item.itemId}`,
  );
  return (data ?? []).map((object) => ({
    name: object.name,
    type: (object.metadata?.mimetype ?? '') as string,
    bytes: (object.metadata?.size ?? 0) as number,
  }));
}

async function storedObjects(item: StoredItem) {
  return (await storedFiles(item)).map((file) => file.name);
}

// The logo's 414x341 PNG is ~210 KB; WebP or JPEG at 80% comes in far below, a PNG re-encode does not.
const COMPRESSED_CEILING_BYTES = 100_000;

// Safari's canvas cannot encode WebP and answers with PNG (MDN browser-compat-data); no Worker keeps the patch on the encoder's thread.
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
  const convertToBlob = OffscreenCanvas.prototype.convertToBlob;
  OffscreenCanvas.prototype.convertToBlob = function (options) {
    return convertToBlob.call(this, {
      ...options,
      type: asSafari(options?.type),
    });
  };
  Object.defineProperty(window, 'Worker', { value: undefined });
}

const uniqueTitle = (what: string) => `${what} ${Date.now()}`;

test.describe('photographs', () => {
  test.beforeEach(async ({ on, page }) => {
    await on(page).categories.do.open(SEED.photoCategory);
  });

  test('a photograph can be added to an entry and is drawn', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const title = uniqueTitle('Fotografiert');
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);

      await card.do.uploadPhoto(PHOTO);

      // Waits for the real picture, not the placeholder that stood in for it.
      await expect(card.locators.images).toBeVisible({ timeout: ARRIVES });
      await expect(card.locators.images).toHaveAttribute('src', /token=/);
    } finally {
      // In finally: reseed() deletes rows, never storage objects, so a leaked entry orphans an upload.
      await app.catalogue.do.removeEntry(title);
    }
  });

  test('the photograph is still there on the next visit', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const title = uniqueTitle('Bleibt');
    try {
      await app.catalogue.do.addEntry(title);
      await app.catalogue.card(title).do.uploadPhoto(PHOTO);
      await expect(app.catalogue.card(title).locators.images).toBeVisible({
        timeout: ARRIVES,
      });

      await app.categories.do.open(SEED.photoCategory);
      await expect(app.catalogue.card(title).locators.images).toBeVisible({
        timeout: ARRIVES,
      });
    } finally {
      await app.catalogue.do.removeEntry(title);
    }
  });

  // Both files live under the owner's prefix, the segment the storage policies key on.
  test('it is stored as a pair, under the owner', async ({ on, page }) => {
    const app = on(page);
    const { token, userId } = context();

    const title = uniqueTitle('Paarweise');
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);
      const itemId = await itemIdFor(token, title);
      await card.do.uploadPhoto(PHOTO);
      await expect(card.locators.images).toBeVisible({ timeout: ARRIVES });

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
      await app.catalogue.do.removeEntry(title);
    }
  });

  test('where the browser cannot encode WebP, it is stored as JPEG and named so', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const { token, userId } = context();
    await page.addInitScript(emulateSafariCanvas);
    await app.categories.do.open(SEED.photoCategory);

    const title = uniqueTitle('Safari');
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);
      const itemId = await itemIdFor(token, title);
      await card.do.uploadPhoto(PHOTO);
      await expect(card.locators.images).toBeVisible({ timeout: ARRIVES });

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
      await app.catalogue.do.removeEntry(title);
    }
  });

  test('a second photograph joins the first rather than replacing it', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const title = uniqueTitle('Zwei');
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);

      await card.do.uploadPhoto(PHOTO);
      await expect(card.locators.images).toHaveCount(1, { timeout: ARRIVES });

      await card.do.uploadPhoto(PHOTO);
      await expect(card.locators.images).toHaveCount(2, { timeout: ARRIVES });
    } finally {
      await app.catalogue.do.removeEntry(title);
    }
  });

  // The delete is deferred to the undo window; closing the toast ends it, so the row and both objects go now.
  test('a photograph can be taken off again, and stays off', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const { token, userId } = context();

    const title = uniqueTitle('Wieder weg');
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);
      const itemId = await itemIdFor(token, title);
      await card.do.uploadPhoto(PHOTO);
      await expect(card.locators.images).toBeVisible({ timeout: ARRIVES });

      await card.locators.buttons.deleteImage.click();
      await app.confirm.do.accept();
      await expect(card.locators.images).toHaveCount(0);
      await app.toast.do.close();

      await app.categories.do.open(SEED.photoCategory);
      await expect(app.catalogue.card(title)()).toBeVisible();
      await expect(app.catalogue.card(title).locators.images).toHaveCount(0);
      await expect
        .poll(() => storedObjects({ token, userId, itemId }), {
          timeout: 15_000,
        })
        .toEqual([]);
    } finally {
      await app.catalogue.do.removeEntry(title);
    }
  });

  // SQL cannot reach object storage, so the app must delete photographs itself.
  test('deleting the entry takes its photographs with it', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const { token, userId } = context();

    const title = uniqueTitle('Mit Aufräumen');
    let itemId: string | undefined;
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);
      itemId = await itemIdFor(token, title);
      await card.do.uploadPhoto(PHOTO);
      await expect(card.locators.images).toBeVisible({ timeout: ARRIVES });

      const during = await storedObjects({ token, userId, itemId });
      expect(during.length).toBeGreaterThan(0);
    } finally {
      await app.catalogue.do.removeEntry(title);
    }

    await expect
      .poll(() => storedObjects({ token, userId, itemId: itemId! }), {
        timeout: 15_000,
      })
      .toEqual([]);
  });
});

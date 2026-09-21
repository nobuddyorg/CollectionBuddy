import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test } from './test';
import { createClient } from '@supabase/supabase-js';

import { CONTEXT_PATH, SEED, type SeedContext } from './fixtures';
// Decode, resize (twice), upload (twice), list, and sign -- all in the
// browser, so a `next build` can't verify any of it. What the storage
// policies allow is checked separately in rls.spec.ts; this checks that an
// ordinary upload still works.
test.use({ locale: 'en-GB' });

// Playwright's default 30s test timeout doesn't reliably cover two real
// browser-side uploads under parallel load.
test.describe.configure({ timeout: 120_000 });
// Kept below the test timeout so a slow upload fails with its own assertion
// message instead of a bare "test timed out".
const ARRIVES = 45_000;

// A real photograph, not fabricated bytes: the compressor decodes what it's
// given, and a canvas can't draw something that only claims to be a PNG.
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

/**
 * Every stored object under one item's own prefix.
 *
 * Scoped to the item, not the whole account: other signed-in specs write
 * under this same owner concurrently (`workers: 2` in CI), so listing the
 * whole account here would pick up their objects too (#664).
 */
async function storedObjects(token: string, userId: string, itemId: string) {
  const { data } = await storageAs(token).list(`${userId}/${itemId}`);
  return (data ?? []).map((object) => object.name);
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
      // In `finally`: reseed() only deletes database rows, never storage
      // objects, so a leaked entry here orphans an upload permanently.
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

  // Both files live under the owner's prefix, the segment storage policies
  // key on; a wrong path locks the photo away from its own owner.
  test('it is stored as a pair, under the owner', async ({
    on,
    page,
  }, testInfo) => {
    testInfo.skip(!process.env.E2E_SUPABASE_URL);
    const app = on(page);
    const { token, userId } = context();

    const title = uniqueTitle('Paarweise');
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);
      const itemId = await itemIdFor(token, title);
      await card.do.uploadPhoto(PHOTO);
      await expect(card.locators.images).toBeVisible({ timeout: ARRIVES });

      const stored = await storedObjects(token, userId, itemId);
      expect(stored).toHaveLength(2);
      expect(
        stored.filter((name) => name.endsWith('.thumb.webp')),
      ).toHaveLength(1);
      expect(
        stored.filter(
          (name) => name.endsWith('.webp') && !name.includes('.thumb'),
        ),
      ).toHaveLength(1);
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

  test('a photograph can be taken off again', async ({ on, page }) => {
    const app = on(page);
    const title = uniqueTitle('Wieder weg');
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);
      await card.do.uploadPhoto(PHOTO);
      await expect(card.locators.images).toBeVisible({ timeout: ARRIVES });

      await card.locators.buttons.deleteImage.click();
      await app.confirm.do.accept();
      await expect(card.locators.images).toHaveCount(0);
    } finally {
      await app.catalogue.do.removeEntry(title);
    }
  });

  // SQL cannot reach object storage, so the app must delete photographs
  // itself or they become unreachable, paid-for orphans.
  test('deleting the entry takes its photographs with it', async ({
    on,
    page,
  }, testInfo) => {
    testInfo.skip(!process.env.E2E_SUPABASE_URL);
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

      const during = await storedObjects(token, userId, itemId);
      expect(during.length).toBeGreaterThan(0);
    } finally {
      await app.catalogue.do.removeEntry(title);
    }

    await expect
      .poll(() => storedObjects(token, userId, itemId!), { timeout: 15_000 })
      .toEqual([]);
  });
});

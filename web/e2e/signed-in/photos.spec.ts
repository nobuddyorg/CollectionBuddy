import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test } from './test';
import { createClient } from '@supabase/supabase-js';

import { CONTEXT_PATH, SEED, type SeedContext } from './fixtures';
import { openCategory } from './helpers';

// Photographs are the point of a collection app, and this is the longest path
// in it: the file is decoded and resized in a canvas, resized again for a
// thumbnail, uploaded twice, listed back, and signed -- and every step is in
// the browser, so a `next build` has nothing to say about any of it.
//
// It is also the private half of a collection. What the storage policies
// allow is checked in rls.spec.ts; what is checked here is that an ordinary
// upload still works, which is the half a policy tightened too far would
// break.
test.use({ locale: 'en-GB' });

// Every test here decodes a photograph, resizes it twice in a canvas and
// uploads two objects -- real work, done in the browser, with another worker
// doing the same thing beside it. Playwright's default 30s covers one upload
// comfortably and two under load not at all.
//
// The assertions below wait for less than this, on purpose: an assertion
// allowed to run as long as the test can never fail with its own message, so
// a slow upload was reported as "test timed out" with nothing about what it
// had been waiting for.
test.describe.configure({ timeout: 120_000 });
const ARRIVES = 45_000;

// A real photograph rather than a fabricated one: the compressor decodes what
// it is given, and a handful of bytes that merely claim to be a PNG is not
// something a canvas can draw.
const PHOTO = resolve(process.cwd(), 'public/logo.png');

const context = () =>
  JSON.parse(readFileSync(CONTEXT_PATH, 'utf8')) as SeedContext;

function storageAs(token: string) {
  return createClient(
    process.env.E2E_SUPABASE_URL!,
    process.env.E2E_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  ).storage.from('item-images');
}

/** Every stored object belonging to this user, across all their entries. */
async function storedObjects(token: string, userId: string) {
  const { data: prefixes } = await storageAs(token).list(userId);
  const names: string[] = [];
  for (const prefix of prefixes ?? []) {
    const { data } = await storageAs(token).list(`${userId}/${prefix.name}`);
    for (const object of data ?? [])
      names.push(`${prefix.name}/${object.name}`);
  }
  return names;
}

async function newEntry(page: import('@playwright/test').Page, title: string) {
  await page.getByTestId('new-entry').click();
  await page.getByTestId('item-title').fill(title);
  await page.getByTestId('item-submit').click();
  const card = page.getByTestId('item-card').filter({ hasText: title });
  await expect(card).toBeVisible();
  return card;
}

async function removeEntry(
  page: import('@playwright/test').Page,
  title: string,
) {
  const card = page.getByTestId('item-card').filter({ hasText: title });
  await card.getByTestId('delete-entry').click();
  await page.getByTestId('confirm-accept').click();
  await expect(card).toHaveCount(0);
}

const uniqueTitle = (what: string) => `${what} ${Date.now()}`;

test.describe('photographs', () => {
  test.beforeEach(async ({ page }) => {
    await openCategory(page, SEED.photoCategory);
  });

  test('a photograph can be added to an entry and is drawn', async ({
    page,
  }) => {
    const title = uniqueTitle('Fotografiert');
    try {
      const card = await newEntry(page, title);

      await card.getByTestId('upload-photo').first().setInputFiles(PHOTO);

      // Compression happens in the browser and the upload is two round trips,
      // so this waits rather than assuming. What it waits for is the picture
      // itself, not the placeholder that stood in for it.
      await expect(card.locator('img')).toBeVisible({ timeout: ARRIVES });
      await expect(card.locator('img')).toHaveAttribute('src', /token=/);
    } finally {
      // In a finally: a leaked entry here is worse than entries.spec.ts's,
      // since reseed() only ever deletes database rows -- it never touches
      // object storage, so an orphaned upload persists across every future
      // run, not just the rest of this one (#338).
      await removeEntry(page, title);
    }
  });

  test('the photograph is still there on the next visit', async ({ page }) => {
    const title = uniqueTitle('Bleibt');
    try {
      const card = await newEntry(page, title);
      await card.getByTestId('upload-photo').first().setInputFiles(PHOTO);
      await expect(card.locator('img')).toBeVisible({ timeout: ARRIVES });

      await openCategory(page, SEED.photoCategory);
      const again = page.getByTestId('item-card').filter({ hasText: title });
      await expect(again.locator('img')).toBeVisible({ timeout: ARRIVES });
    } finally {
      await removeEntry(page, title);
    }
  });

  // Full size and thumbnail, both under the owner's own prefix -- which is
  // the segment the storage policies key on, so getting the path wrong locks
  // a photograph away from the person who took it.
  test('it is stored as a pair, under the owner', async ({
    page,
  }, testInfo) => {
    testInfo.skip(!process.env.E2E_SUPABASE_URL);
    const { token, userId } = context();

    const before = await storedObjects(token, userId);
    const title = uniqueTitle('Paarweise');
    try {
      const card = await newEntry(page, title);
      await card.getByTestId('upload-photo').first().setInputFiles(PHOTO);
      await expect(card.locator('img')).toBeVisible({ timeout: ARRIVES });

      const added = (await storedObjects(token, userId)).filter(
        (name) => !before.includes(name),
      );
      expect(added).toHaveLength(2);
      expect(added.filter((name) => name.endsWith('.thumb.webp'))).toHaveLength(
        1,
      );
      expect(
        added.filter(
          (name) => name.endsWith('.webp') && !name.includes('.thumb'),
        ),
      ).toHaveLength(1);
    } finally {
      await removeEntry(page, title);
    }
  });

  test('a second photograph joins the first rather than replacing it', async ({
    page,
  }) => {
    const title = uniqueTitle('Zwei');
    try {
      const card = await newEntry(page, title);

      await card.getByTestId('upload-photo').first().setInputFiles(PHOTO);
      await expect(card.locator('img')).toHaveCount(1, { timeout: ARRIVES });

      await card.getByTestId('upload-photo').first().setInputFiles(PHOTO);
      await expect(card.locator('img')).toHaveCount(2, { timeout: ARRIVES });
    } finally {
      await removeEntry(page, title);
    }
  });

  test('a photograph can be taken off again', async ({ page }) => {
    const title = uniqueTitle('Wieder weg');
    try {
      const card = await newEntry(page, title);
      await card.getByTestId('upload-photo').first().setInputFiles(PHOTO);
      await expect(card.locator('img')).toBeVisible({ timeout: ARRIVES });

      await card.getByRole('button', { name: /delete image/i }).click();
      await page.getByTestId('confirm-accept').click();
      await expect(card.locator('img')).toHaveCount(0);
    } finally {
      await removeEntry(page, title);
    }
  });

  // No trigger cleans these up -- SQL cannot reach object storage, so the app
  // has to, and an entry deleted without its photographs leaves them paid for
  // and unreachable forever.
  test('deleting the entry takes its photographs with it', async ({
    page,
  }, testInfo) => {
    testInfo.skip(!process.env.E2E_SUPABASE_URL);
    const { token, userId } = context();

    const before = await storedObjects(token, userId);
    const title = uniqueTitle('Mit Aufräumen');
    try {
      const card = await newEntry(page, title);
      await card.getByTestId('upload-photo').first().setInputFiles(PHOTO);
      await expect(card.locator('img')).toBeVisible({ timeout: ARRIVES });

      const during = await storedObjects(token, userId);
      expect(during.length).toBeGreaterThan(before.length);
    } finally {
      await removeEntry(page, title);
    }

    await expect
      .poll(() => storedObjects(token, userId), { timeout: 15_000 })
      .toEqual(before);
  });
});

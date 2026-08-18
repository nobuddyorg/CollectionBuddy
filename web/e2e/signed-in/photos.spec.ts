import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test } from './test';
import { createClient } from '@supabase/supabase-js';

import { CONTEXT_PATH, SEED, type SeedContext } from './fixtures';
import { openCategory } from './helpers';

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

      // Waits for the real picture, not the placeholder that stood in for it.
      await expect(card.locator('img')).toBeVisible({ timeout: ARRIVES });
      await expect(card.locator('img')).toHaveAttribute('src', /token=/);
    } finally {
      // In `finally`: reseed() only deletes database rows, never storage
      // objects, so a leaked entry here orphans an upload permanently.
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

  // Both files live under the owner's prefix, the segment storage policies
  // key on; a wrong path locks the photo away from its own owner.
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

  // SQL cannot reach object storage, so the app must delete photographs
  // itself or they become unreachable, paid-for orphans.
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

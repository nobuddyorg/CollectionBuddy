import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createClient } from '@supabase/supabase-js';

import { expect, test } from './test';

import { removeEntriesTitled } from './cleanup';
import { CONTEXT_PATH, SEED, type SeedContext } from './fixtures';
// photos.spec.ts proves a photograph is stored; this opens it full size and walks the carousel.
test.use({ locale: 'en-GB' });

// Two real uploads before the first assertion, same as photos.spec.ts.
test.describe.configure({ timeout: 120_000 });
const ARRIVES = 45_000;

const PHOTO = resolve(process.cwd(), 'public/logo.png');
// A file input ignores the very file it already holds, so repeated uploads alternate.
const PHOTOS = [PHOTO, resolve(process.cwd(), 'public/icon-192.png')];
const uniqueTitle = (what: string) => `${what} ${Date.now()}`;

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

async function itemIdFor(token: string, title: string) {
  const { data, error } = await apiAs(token)
    .from('items')
    .select('id')
    .eq('title', title)
    .single();
  if (error) throw error;
  return data.id as string;
}

async function photoCount(token: string, itemId: string) {
  const { count } = await apiAs(token)
    .from('images')
    .select('id', { count: 'exact', head: true })
    .eq('item_id', itemId);
  return count ?? 0;
}

test.describe('looking at a photograph full size', () => {
  test('opens, walks both ways between two, and closes on Escape', async ({
    on,
    page,
  }) => {
    const app = on(page);
    await app.categories.do.open(SEED.viewerCategory);

    const title = uniqueTitle('Angeschaut');
    try {
      await app.catalogue.do.addEntry(title);
      const card = app.catalogue.card(title);

      await card.do.uploadPhoto(PHOTO);
      await expect(card.locators.images).toHaveCount(1, { timeout: ARRIVES });
      await card.do.uploadPhoto(PHOTO);
      await expect(card.locators.images).toHaveCount(2, { timeout: ARRIVES });

      await card.do.openImage();
      await expect(app.viewer()).toBeVisible();
      await expect(app.viewer.locators.position).toHaveText('1 / 2');

      // Arrow keys and the buttons drive the same carousel.
      await page.keyboard.press('ArrowRight');
      await expect(app.viewer.locators.position).toHaveText('2 / 2');
      await app.viewer.do.previous();
      await expect(app.viewer.locators.position).toHaveText('1 / 2');

      await page.keyboard.press('Escape');
      await expect(app.viewer()).toHaveCount(0);
    } finally {
      await removeEntriesTitled(title);
    }
  });

  // A card signs only the five photographs it shows; the rest are signed once the carousel opens.
  test('shows a photograph past the card once the carousel reaches it', async ({
    on,
    page,
  }) => {
    test.setTimeout(240_000);
    const app = on(page);
    const { token } = context();
    await app.categories.do.open(SEED.viewerCategory);

    const title = uniqueTitle('Sechsfach');
    try {
      await app.catalogue.do.addEntry(title);
      // Past five the card shows no more plates, so each upload is awaited by its photograph row instead.
      const itemId = await itemIdFor(token, title);
      for (let upload = 1; upload <= 6; upload++) {
        // The control stays disabled until the card has shown the last one.
        await expect(
          app.catalogue.card(title).locators.uploadInput,
        ).toBeEnabled({ timeout: ARRIVES });
        await app.catalogue.card(title).do.uploadPhoto(PHOTOS[upload % 2]);
        await expect
          .poll(() => photoCount(token, itemId), { timeout: ARRIVES })
          .toBe(upload);
      }

      // A fresh page read, so nothing past the card is signed yet.
      await app.categories.do.open(SEED.viewerCategory);
      const card = app.catalogue.card(title);
      await expect(card.locators.images).toHaveCount(5, { timeout: ARRIVES });

      await card.do.openImage();
      for (let step = 0; step < 5; step++)
        await page.keyboard.press('ArrowRight');
      await expect(app.viewer.locators.position).toHaveText('6 / 6');
      await expect(app.viewer.locators.photo).toHaveAttribute(
        'src',
        /\/object\/sign\//,
      );
    } finally {
      await removeEntriesTitled(title);
    }
  });
});

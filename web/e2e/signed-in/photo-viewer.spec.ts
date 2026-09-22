import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createClient } from '@supabase/supabase-js';

import { expect, test } from './test';

import { CONTEXT_PATH, SEED, type SeedContext } from './fixtures';
// photos.spec.ts proves a photograph is stored and drawn; this is what a
// collector does with it afterwards -- opening it full size and walking a
// carousel that only exists once two are attached.
test.use({ locale: 'en-GB' });

// Two real uploads before the first assertion, same as photos.spec.ts.
test.describe.configure({ timeout: 120_000 });
const ARRIVES = 45_000;

const PHOTO = resolve(process.cwd(), 'public/logo.png');
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
      await app.catalogue.do.removeEntry(title);
    }
  });

  // A card signs only the photographs it can show (hero and a strip of four);
  // the rest are signed once the carousel opens (#630).
  test('shows a photograph past the card once the carousel reaches it', async ({
    on,
    page,
  }, testInfo) => {
    testInfo.skip(!process.env.E2E_SUPABASE_URL);
    test.setTimeout(240_000);
    const app = on(page);
    const { token } = context();
    await app.categories.do.open(SEED.viewerCategory);

    const title = uniqueTitle('Sechsfach');
    try {
      await app.catalogue.do.addEntry(title);
      // Past five the card shows no more plates, so each upload is awaited
      // by its photograph row, read back the way any client could.
      const itemId = await itemIdFor(token, title);
      for (let upload = 1; upload <= 6; upload++) {
        await app.catalogue.card(title).do.uploadPhoto(PHOTO);
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

      await page.keyboard.press('Escape');
    } finally {
      await app.catalogue.do.removeEntry(title);
    }
  });
});

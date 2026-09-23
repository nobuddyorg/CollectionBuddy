import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createClient } from '@supabase/supabase-js';

import { expect, test } from './test';
import { CONTEXT_PATH, type SeedContext } from './fixtures';

// The other half of categories.spec.ts: a collection with contents, whose photographs only the client sweeps.
test.use({ locale: 'en-GB' });

// A real upload before the delete even starts.
test.describe.configure({ timeout: 120_000 });
const ARRIVES = 45_000;

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

async function itemIdFor(token: string, title: string) {
  const { data, error } = await apiAs(token)
    .from('items')
    .select('id')
    .eq('title', title)
    .single();
  if (error) throw error;
  return data.id as string;
}

/** Every stored object under one item's own prefix, not the whole account. */
async function storedObjects(item: {
  token: string;
  userId: string;
  itemId: string;
}) {
  const { data } = await apiAs(item.token)
    .storage.from('item-images')
    .list(`${item.userId}/${item.itemId}`);
  return (data ?? []).map((object) => object.name);
}

test.describe('deleting a collection that still holds things', () => {
  test('counts what it is about to destroy, and takes the photographs too', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const { token, userId } = context();

    // Its own throwaway collection: nothing seeded is safe to delete out from under the suite.
    const name = `E2E Vollgepackt ${Date.now()}`;
    const title = `Inhalt ${Date.now()}`;

    await page.goto('', { waitUntil: 'networkidle' });
    await expect(app.categories.locators.selected).not.toBeEmpty();
    await app.categories.do.create(name);

    await app.catalogue.do.addEntry(title);
    const card = app.catalogue.card(title);
    const itemId = await itemIdFor(token, title);
    await card.do.uploadPhoto(PHOTO);
    await expect(card.locators.images).toBeVisible({ timeout: ARRIVES });
    expect(await storedObjects({ token, userId, itemId })).not.toEqual([]);

    await app.categories.do.delete();
    // Named and counted, not a bare "are you sure".
    await expect(app.confirm.locators.message).toContainText(
      `Delete "${name}"? Its 1 entries`,
    );
    await app.confirm.do.accept();

    await expect(app.categories.locators.selected).not.toHaveText(name);
    await expect
      .poll(() => storedObjects({ token, userId, itemId }), { timeout: 15_000 })
      .toEqual([]);
  });

  // The delete waits out the undo window; undo inside it puts the collection back, selected, with nothing lost.
  test('can be taken back inside the undo window', async ({ on, page }) => {
    const app = on(page);
    const name = `E2E Doch behalten ${Date.now()}`;
    const title = `Inhalt ${Date.now()}`;

    await page.goto('', { waitUntil: 'networkidle' });
    await expect(app.categories.locators.selected).not.toBeEmpty();
    await app.categories.do.create(name);
    await app.catalogue.do.addEntry(title);

    try {
      await app.categories.do.delete();
      await app.confirm.do.accept();
      await expect(app.categories.locators.selected).not.toHaveText(name);

      await app.toast.do.undo();
      await expect(app.categories.locators.selected).toHaveText(name);
      await expect(app.catalogue.card(title)()).toBeVisible();

      // Nothing was deleted, so it survives a trip to the database.
      await app.categories.do.open(name);
      await expect(app.catalogue.card(title)()).toBeVisible();
    } finally {
      await app.categories.do.open(name);
      await app.categories.do.delete();
      await app.confirm.do.accept();
      await app.toast.do.close();
      await expect(app.categories.locators.selected).not.toHaveText(name);
    }
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createClient } from '@supabase/supabase-js';

import { expect, test } from './test';
import { CONTEXT_PATH, type SeedContext } from './fixtures';

// categories.spec.ts deletes an empty collection, which is the harmless
// half. This is the other one: a collection with an entry and a photograph
// in it, where the confirmation has to count what is about to go, and the
// files have to be swept client-side -- SQL cannot reach object storage, so
// nothing else ever would.
test.use({ locale: 'en-GB' });

// A real upload before the delete even starts.
test.describe.configure({ timeout: 120_000 });
const ARRIVES = 45_000;

type Page = import('@playwright/test').Page;

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
async function storedObjects(token: string, userId: string, itemId: string) {
  const { data } = await apiAs(token)
    .storage.from('item-images')
    .list(`${userId}/${itemId}`);
  return (data ?? []).map((object) => object.name);
}

async function expandPanel(page: Page) {
  const expand = page.getByTestId('expand-categories');
  if (await expand.isVisible()) await expand.click();
}

test.describe('deleting a collection that still holds things', () => {
  test('counts what it is about to destroy, and takes the photographs too', async ({
    page,
  }, testInfo) => {
    testInfo.skip(!process.env.E2E_SUPABASE_URL);
    const { token, userId } = context();

    // Its own throwaway collection, created here and destroyed by the test
    // itself -- nothing seeded is safe to delete out from under the suite.
    const name = `E2E Vollgepackt ${Date.now()}`;
    const title = `Inhalt ${Date.now()}`;

    await page.goto('', { waitUntil: 'networkidle' });
    await expect(page.getByTestId('selected-category')).not.toBeEmpty();
    await expandPanel(page);
    await page.getByLabel('New collection').fill(name);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByTestId('selected-category')).toHaveText(name);

    await page.getByTestId('new-entry').click();
    await page.getByTestId('item-title').fill(title);
    await page.getByTestId('item-submit').click();

    const card = page.getByTestId('item-card').filter({ hasText: title });
    await expect(card).toBeVisible();
    const itemId = await itemIdFor(token, title);
    await card.getByTestId('upload-photo').first().setInputFiles(PHOTO);
    await expect(card.locator('img')).toBeVisible({ timeout: ARRIVES });
    expect(await storedObjects(token, userId, itemId)).not.toEqual([]);

    await expandPanel(page);
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    // Named and counted, not a bare "are you sure".
    await expect(
      page.getByText(`Delete "${name}"? Its 1 entries`),
    ).toBeVisible();
    await page.getByTestId('confirm-accept').click();

    await expect(page.getByTestId('selected-category')).not.toHaveText(name);
    await expect
      .poll(() => storedObjects(token, userId, itemId), { timeout: 15_000 })
      .toEqual([]);
  });
});

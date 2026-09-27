import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';

import { expect, test } from './test';
import {
  CONTEXT_PATH,
  OTHER_AUTH_STATE_PATH,
  SEED,
  type SeedContext,
} from './fixtures';
import { removeCategoryNamed } from './cleanup';
import { share } from './rls/helpers';

// The grantee's side, in their own session; rls/viewer-share.spec.ts has what it reaches.
test.use({ storageState: OTHER_AUTH_STATE_PATH, locale: 'en-GB' });

const context = () =>
  JSON.parse(readFileSync(CONTEXT_PATH, 'utf8')) as SeedContext;

/** A PostgREST client carrying one user's access token, and nothing more. */
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

async function ownedCategoryId(owner: {
  token: string;
  userId: string;
  name: string;
}) {
  const { data, error } = await apiAs(owner.token)
    .from('categories')
    .select('id')
    .eq('user_id', owner.userId)
    .eq('name', owner.name)
    .single();
  if (error) throw error;
  return data.id as string;
}

test.describe('a collection shared with you', () => {
  test('is marked as someone else, refuses the owner controls, and can be left', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const { token, userId } = context();

    // Issued by the owner, as sharing.spec.ts does through the panel.
    const categoryId = await ownedCategoryId({
      token,
      userId,
      name: SEED.grantedCategory,
    });
    const { data: grant, error } = await apiAs(token)
      .from('category_shares')
      .insert({ category_id: categoryId, invited_email: SEED.other.email })
      .select('id')
      .single();
    if (error) throw error;

    try {
      await page.goto('', { waitUntil: 'networkidle' });
      await expect(app.categories.locators.selected).not.toBeEmpty();
      await app.categories.do.openPanel();

      await expect(
        app.categories.sharedMarkerOn(SEED.grantedCategory),
      ).toBeVisible();
      await app.categories.tab(SEED.grantedCategory).click();

      await expect(app.categories.locators.selected).toHaveText(
        SEED.grantedCategory,
      );
      await expect(app.catalogue.card('Schatullenstück')()).toBeVisible();

      // A viewer grant reads; the one control that would write is shut.
      await expect(app.catalogue.locators.buttons.newEntry).toBeDisabled();

      await app.categories.do.openPanel();
      // Both would be refused: the rename by RLS, the export by the prefix.
      await expect(app.categories.locators.buttons.rename).toBeDisabled();
      await expect(app.categories.locators.buttons.export).toBeDisabled();
      // Who else a collection is shared with is the owner's business.
      await expect(app.sharing.locators.inputs.email).toHaveCount(0);

      // Same button as an owner's delete; here it ends only their access.
      await app.categories.do.delete();
      await expect(app.confirm.locators.message).toContainText(
        `Leave "${SEED.grantedCategory}"?`,
      );
      await app.confirm.do.accept();

      await expect(app.categories.locators.selected).not.toHaveText(
        SEED.grantedCategory,
      );
      await app.categories.do.openPanel();
      await expect(app.categories.tab(SEED.grantedCategory)).toHaveCount(0);

      // Sent at once, with no undo window: once confirmed, a reload straight away finds it still gone.
      await expect(
        app.toast().filter({ hasText: 'Left shared collection.' }),
      ).toBeVisible();
      await page.reload({ waitUntil: 'networkidle' });
      await expect(app.categories.locators.selected).not.toBeEmpty();
      await app.categories.do.openPanel();
      await expect(app.categories.tab(SEED.grantedCategory)).toHaveCount(0);
      const { data: left } = await apiAs(token)
        .from('category_shares')
        .select('id')
        .eq('id', grant.id);
      expect(left).toEqual([]);
    } finally {
      // Cleanup for a run that failed before leaving.
      await apiAs(token).from('category_shares').delete().eq('id', grant.id);
    }
  });
});

const BLANK_TILE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

test.describe('the map of a collection shared with you', () => {
  // RLS answers a viewer's write-back with zero rows, so sending one only spends a request.
  test('looks up a hand-typed place without writing its coordinates back', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const { token, userId } = context();
    const name = `E2E Geteilte Karte ${Date.now()}`;
    const owner = apiAs(token);
    const { data: category, error } = await owner
      .from('categories')
      .insert({ user_id: userId, name })
      .select('id')
      .single();
    if (error) throw error;

    try {
      const { data: item, error: itemError } = await owner
        .from('items')
        .insert({ user_id: userId, title: 'Kartenstück', place: 'Aachen' })
        .select('id')
        .single();
      if (itemError) throw itemError;
      const { error: linkError } = await owner
        .from('item_categories')
        .insert({ item_id: item.id, category_id: category.id });
      if (linkError) throw linkError;
      await share({
        token,
        categoryId: category.id,
        invitedEmail: SEED.other.email,
      });
      await page.route('https://photon.komoot.io/**', (route) =>
        route.fulfill({
          json: {
            features: [
              {
                properties: { name: 'Aachen' },
                geometry: { type: 'Point', coordinates: [6.0839, 50.7753] },
              },
            ],
          },
        }),
      );

      // The map stays open for the whole listening window, so its tiles come from here, not the network.
      await page.route('https://*.tile.openstreetmap.org/**', (route) =>
        route.fulfill({ contentType: 'image/png', body: BLANK_TILE }),
      );

      await page.goto('', { waitUntil: 'networkidle' });
      await expect(app.categories.locators.selected).not.toBeEmpty();
      await app.categories.do.openPanel();
      await app.categories.tab(name).click();
      await expect(app.catalogue.card('Kartenstück')()).toBeVisible();

      // Listening from before the map opens: an owner's write-back leaves within milliseconds of its pin.
      const wroteBack = page
        .waitForRequest(
          (request) =>
            request.method() === 'PATCH' &&
            request.url().includes('/rest/v1/items'),
          { timeout: 5_000 },
        )
        .then(
          () => true,
          () => false,
        );
      await app.map.do.open();
      await expect(app.map.locators.pins).toHaveCount(1);

      expect(await wroteBack).toBe(false);
    } finally {
      await removeCategoryNamed(name);
    }
  });
});

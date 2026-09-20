import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';

import { expect, test } from './test';
import {
  CONTEXT_PATH,
  OTHER_AUTH_STATE_PATH,
  SEED,
  type SeedContext,
} from './fixtures';

// The grantee's side, in their own session; rls.spec.ts has what it reaches.
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

async function ownedCategoryId(token: string, userId: string, name: string) {
  const { data, error } = await apiAs(token)
    .from('categories')
    .select('id')
    .eq('user_id', userId)
    .eq('name', name)
    .single();
  if (error) throw error;
  return data.id as string;
}

test.describe('a collection shared with you', () => {
  test('is marked as someone else, refuses the owner controls, and can be left', async ({
    on,
    page,
  }, testInfo) => {
    testInfo.skip(!process.env.E2E_SUPABASE_URL);
    const app = on(page);
    const { token, userId } = context();

    // Issued by the owner, as sharing.spec.ts does through the panel.
    const categoryId = await ownedCategoryId(
      token,
      userId,
      SEED.grantedCategory,
    );
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
    } finally {
      // Leaving deletes the grant only after the undo window, or not at all.
      await apiAs(token).from('category_shares').delete().eq('id', grant.id);
    }
  });
});

import { createClient } from '@supabase/supabase-js';

import { expect, test } from '../test';
import { SEED } from '../fixtures';
import { clearCollection, ensureUser, mintSession } from '../collectors';
import { apiAs } from './helpers';

const BUCKET = 'item-images';
const probe = () => new Blob(['probe'], { type: 'image/webp' });

async function collector(email: string) {
  const userId = await ensureUser(email, SEED.accountDeletion.password);
  const session = await mintSession(email, SEED.accountDeletion.password);
  await clearCollection(session.client, userId);
  return { email, userId, token: session.token, client: session.client };
}

/** A collection of one entry, created as `token`. */
async function collectionWithEntry(token: string, name: string) {
  const api = apiAs(token);
  const { data: category, error: categoryError } = await api
    .from('categories')
    .insert({ name })
    .select('id')
    .single();
  if (categoryError) throw categoryError;
  const { error } = await api.rpc('create_items_in_category', {
    target_category_id: category.id,
    entries: [{ title: SEED.accountDeletion.item }],
  });
  if (error) throw error;
  const { data: item, error: itemError } = await api
    .from('item_categories')
    .select('item_id')
    .eq('category_id', category.id)
    .single();
  if (itemError) throw itemError;
  return { categoryId: category.id, itemId: item.item_id };
}

async function photograph(
  token: string,
  entry: { uploaderId: string; itemId: string; name: string },
) {
  const path = `${entry.uploaderId}/${entry.itemId}/${entry.name}.webp`;
  const api = apiAs(token);
  const { error: uploadError } = await api.storage
    .from(BUCKET)
    .upload(path, probe());
  if (uploadError) throw uploadError;
  const { error } = await api
    .from('images')
    .insert({ item_id: entry.itemId, path_full: path });
  if (error) throw error;
  return path;
}

// Two collectors of their own per parallel slot: one deletes its account, the other must keep everything of its own.
test.describe('deleting one’s own account', () => {
  test('anon cannot call it', async () => {
    const anon = createClient(
      process.env.E2E_SUPABASE_URL!,
      process.env.E2E_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { error } = await anon.rpc('delete_own_account');
    expect(error).not.toBeNull();
  });

  test('removes the caller’s account and rows once its photographs are gone, and nothing of another’s', async ({}, testInfo) => {
    const slot = testInfo.parallelIndex;
    const leaver = await collector(
      `e2e-rls-leaver-${slot}@collectionbuddy.test`,
    );
    const keeper = await collector(
      `e2e-rls-keeper-${slot}@collectionbuddy.test`,
    );
    // Under the leaver's prefix, so clearCollection's sweep of the keeper's own would miss it.
    let addedPhoto: string | null = null;

    try {
      const kept = await collectionWithEntry(keeper.token, 'rls-kept');
      const { error: shareError } = await apiAs(keeper.token)
        .from('category_shares')
        .insert({
          category_id: kept.categoryId,
          invited_email: leaver.email,
          role: 'editor',
        });
      if (shareError) throw shareError;

      const own = await collectionWithEntry(leaver.token, 'rls-leaving');
      const ownPhoto = await photograph(leaver.token, {
        uploaderId: leaver.userId,
        itemId: own.itemId,
        name: 'own',
      });
      // As editor, onto the keeper's entry: the record, and so the photograph, is the keeper's.
      addedPhoto = await photograph(leaver.token, {
        uploaderId: leaver.userId,
        itemId: kept.itemId,
        name: 'added',
      });

      const refused = await apiAs(leaver.token).rpc('delete_own_account');
      expect(refused.error?.code).toBe('PT409');
      const { data: stillThere } = await apiAs(leaver.token)
        .from('categories')
        .select('id')
        .eq('id', own.categoryId);
      expect(stillThere).toHaveLength(1);

      const { error: removeError } = await apiAs(leaver.token)
        .storage.from(BUCKET)
        .remove([ownPhoto]);
      expect(removeError).toBeNull();
      const { error } = await apiAs(leaver.token).rpc('delete_own_account');
      expect(error).toBeNull();

      // The refresh token went with the Auth user.
      const { error: refreshError } = await leaver.client.auth.refreshSession();
      expect(refreshError).not.toBeNull();
      await expect(
        mintSession(leaver.email, SEED.accountDeletion.password),
      ).rejects.toThrow();

      const keeperApi = apiAs(keeper.token);
      const { data: shares } = await keeperApi
        .from('category_shares')
        .select('id')
        .eq('category_id', kept.categoryId);
      expect(shares).toEqual([]);
      const { data: keptItem } = await keeperApi
        .from('items')
        .select('id')
        .eq('id', kept.itemId);
      expect(keptItem).toHaveLength(1);
      const { data: signed, error: signError } = await keeperApi.storage
        .from(BUCKET)
        .createSignedUrl(addedPhoto, 60);
      expect(signError).toBeNull();
      expect(signed?.signedUrl).toBeTruthy();
      const { data: leftBehind } = await keeperApi
        .from('categories')
        .select('id')
        .eq('id', own.categoryId);
      expect(leftBehind).toEqual([]);
    } finally {
      if (addedPhoto) {
        await apiAs(keeper.token).storage.from(BUCKET).remove([addedPhoto]);
      }
      await clearCollection(keeper.client, keeper.userId);
    }
  });

  // The client removes every path its own rows name; Storage must skip the ones it may no longer delete, not refuse the batch.
  test('an entry filed under a grant that has since ended does not hold the account', async ({}, testInfo) => {
    const slot = testInfo.parallelIndex;
    const leaver = await collector(
      `e2e-rls-stranded-${slot}@collectionbuddy.test`,
    );
    const keeper = await collector(
      `e2e-rls-stranding-${slot}@collectionbuddy.test`,
    );
    let strandedPhoto: string | null = null;

    try {
      const kept = await collectionWithEntry(keeper.token, 'rls-stranding');
      const { data: grant, error: shareError } = await apiAs(keeper.token)
        .from('category_shares')
        .insert({
          category_id: kept.categoryId,
          invited_email: leaver.email,
          role: 'editor',
        })
        .select('id')
        .single();
      if (shareError) throw shareError;

      const { data: filed, error: filedError } = await apiAs(leaver.token)
        .from('items')
        .insert({ title: 'rls-stranded' })
        .select('id')
        .single();
      if (filedError) throw filedError;
      const { error: linkError } = await apiAs(leaver.token)
        .from('item_categories')
        .insert({ item_id: filed.id, category_id: kept.categoryId });
      if (linkError) throw linkError;
      strandedPhoto = await photograph(leaver.token, {
        uploaderId: leaver.userId,
        itemId: filed.id,
        name: 'stranded',
      });
      const { error: revokeError } = await apiAs(keeper.token)
        .from('category_shares')
        .delete()
        .eq('id', grant.id);
      if (revokeError) throw revokeError;

      const { data: rows } = await apiAs(leaver.token)
        .from('images')
        .select('path_full')
        .eq('user_id', leaver.userId);
      expect(rows).toEqual([{ path_full: strandedPhoto }]);
      const { data: removed, error: removeError } = await apiAs(leaver.token)
        .storage.from(BUCKET)
        .remove([strandedPhoto]);
      expect(removeError).toBeNull();
      expect(removed).toEqual([]);

      const { error } = await apiAs(leaver.token).rpc('delete_own_account');
      expect(error).toBeNull();
      await expect(
        mintSession(leaver.email, SEED.accountDeletion.password),
      ).rejects.toThrow();
    } finally {
      // Left for the daily sweep in production; nobody's token reaches it now.
      if (strandedPhoto) {
        const admin = createClient(
          process.env.E2E_SUPABASE_URL!,
          process.env.E2E_SUPABASE_SERVICE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );
        await admin.storage.from(BUCKET).remove([strandedPhoto]);
      }
      await clearCollection(keeper.client, keeper.userId);
    }
  });
});

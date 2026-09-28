import { expect, test } from '../test';
import { SEED } from '../fixtures';
import {
  BUCKET,
  adminApi,
  clearCollection,
  freshCollector,
  mintSession,
} from '../collectors';
import {
  anonApi,
  apiAs,
  entryFiledBy,
  probeObject,
  share,
  unshare,
} from './helpers';

const collector = (email: string) =>
  freshCollector(email, SEED.accountDeletion.password);

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
    .upload(path, probeObject());
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
    const { error } = await anonApi().rpc('delete_own_account');
    expect(error).toMatchObject({
      code: '42501',
      message: 'permission denied for function delete_own_account',
    });
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
      await share({
        token: keeper.token,
        categoryId: kept.categoryId,
        invitedEmail: leaver.email,
        role: 'editor',
      });

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
      expect(refreshError).toMatchObject({ code: 'refresh_token_not_found' });
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
      const grantId = await share({
        token: keeper.token,
        categoryId: kept.categoryId,
        invitedEmail: leaver.email,
        role: 'editor',
      });

      const filedId = await entryFiledBy(
        { token: leaver.token, categoryId: kept.categoryId },
        'rls-stranded',
      );
      strandedPhoto = await photograph(leaver.token, {
        uploaderId: leaver.userId,
        itemId: filedId,
        name: 'stranded',
      });
      await unshare(keeper.token, grantId);

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
        await adminApi().storage.from(BUCKET).remove([strandedPhoto]);
      }
      await clearCollection(keeper.client, keeper.userId);
    }
  });
});

// The operator's path for a request by email (developer-guide.md): objects first, then the Auth user, whose rows 0034 cascades.
test.describe('an operator deleting the Auth user', () => {
  test('takes its rows and the grants it made, leaves another’s, and its leftover token writes nothing', async ({}, testInfo) => {
    const slot = testInfo.parallelIndex;
    const leaver = await collector(
      `e2e-rls-removed-${slot}@collectionbuddy.test`,
    );
    const keeper = await collector(
      `e2e-rls-remaining-${slot}@collectionbuddy.test`,
    );

    try {
      const left = await collectionWithEntry(leaver.token, 'rls-removed');
      const ownPhoto = await photograph(leaver.token, {
        uploaderId: leaver.userId,
        itemId: left.itemId,
        name: 'own',
      });
      await share({
        token: leaver.token,
        categoryId: left.categoryId,
        invitedEmail: keeper.email,
      });
      const kept = await collectionWithEntry(keeper.token, 'rls-remaining');
      const keeperApi = apiAs(keeper.token);
      const { data: sharedBefore } = await keeperApi
        .from('categories')
        .select('id')
        .eq('id', left.categoryId);
      expect(sharedBefore).toHaveLength(1);

      const operator = adminApi();
      const { error: removeError } = await operator.storage
        .from(BUCKET)
        .remove([ownPhoto]);
      expect(removeError).toBeNull();
      const { error } = await operator.auth.admin.deleteUser(leaver.userId);
      expect(error).toBeNull();

      const { data: sharedAfter } = await keeperApi
        .from('categories')
        .select('id')
        .eq('id', left.categoryId);
      expect(sharedAfter).toEqual([]);
      const { data: sharedEntry } = await keeperApi
        .from('items')
        .select('id')
        .eq('id', left.itemId);
      expect(sharedEntry).toEqual([]);
      const { data: keptItem } = await keeperApi
        .from('items')
        .select('id')
        .eq('id', kept.itemId);
      expect(keptItem).toHaveLength(1);

      // A token outlives its user until it expires; the foreign keys refuse a row under a uid no one can sign in as.
      const { error: writeError } = await apiAs(leaver.token)
        .from('categories')
        .insert({ name: 'rls-after-the-account' });
      expect(writeError?.code).toBe('23503');
    } finally {
      await clearCollection(keeper.client, keeper.userId);
    }
  });
});

import { type SupabaseClient } from '@supabase/supabase-js';

import { SEED } from './fixtures';
import { apiAs, context, editorShare, unshare } from './rls/helpers';

// Cleanup goes through the API as the owner: a delete in the interface waits out its undo window, past the test.
const BUCKET = 'item-images';

async function removeObjectsUnder(api: SupabaseClient, prefix: string) {
  const { data: objects, error } = await api.storage.from(BUCKET).list(prefix);
  if (error) throw error;
  if (objects.length === 0) return;
  const { error: removeError } = await api.storage
    .from(BUCKET)
    .remove(objects.map((object) => `${prefix}/${object.name}`));
  if (removeError) throw removeError;
}

/** Each entry's objects, then the entries: the rows first would leave the files unnamed. */
async function removeEntries(itemIds: string[]) {
  if (itemIds.length === 0) return;
  const { token, userId } = context();
  const api = apiAs(token);
  for (const itemId of itemIds) {
    await removeObjectsUnder(api, `${userId}/${itemId}`);
  }
  const { error } = await api.from('items').delete().in('id', itemIds);
  if (error) throw error;
}

/** The second collector's objects under, and own rows among, entries titled `titles`; owner's rows are left to her. */
export async function removeGranteeWrites(granted: {
  categoryId: string;
  titles: string[];
}) {
  const { token, otherToken, otherUserId } = context();
  // Only a live editor grant lets the grantee remove what it wrote, so whatever grant is left is replaced by one.
  const { error: revokeError } = await apiAs(token)
    .from('category_shares')
    .delete()
    .eq('category_id', granted.categoryId)
    .eq('invited_email', SEED.other.email);
  if (revokeError) throw revokeError;
  const shareId = await editorShare(token, granted.categoryId);
  try {
    const grantee = apiAs(otherToken);
    const { data, error } = await grantee
      .from('items')
      .select('id, user_id')
      .in('title', granted.titles);
    if (error) throw error;
    for (const item of data) {
      await removeObjectsUnder(grantee, `${otherUserId}/${item.id}`);
    }
    const own = data.filter((item) => item.user_id === otherUserId);
    if (own.length === 0) return;
    const { error: deleteError } = await grantee
      .from('items')
      .delete()
      .in(
        'id',
        own.map((item) => item.id),
      );
    if (deleteError) throw deleteError;
  } finally {
    await unshare(token, shareId);
  }
}

/** Every entry of the seeded owner's titled `title`, gone already or not; an imported copy shares the title. */
export async function removeEntriesTitled(title: string) {
  const { token, userId } = context();
  const { data, error } = await apiAs(token)
    .from('items')
    .select('id')
    .eq('user_id', userId)
    .eq('title', title);
  if (error) throw error;
  await removeEntries(data.map((row) => row.id));
}

/** The seeded owner's category named `name` with every entry in it, gone already or not. */
export async function removeCategoryNamed(name: string) {
  const { token, userId } = context();
  const api = apiAs(token);
  const { data, error } = await api
    .from('categories')
    .select('id, item_categories(item_id)')
    .eq('user_id', userId)
    .eq('name', name);
  if (error) throw error;
  if (data.length === 0) return;

  await removeEntries(
    data.flatMap((category) =>
      category.item_categories.map((link) => link.item_id),
    ),
  );
  const { error: deleteError } = await api
    .from('categories')
    .delete()
    .in(
      'id',
      data.map((category) => category.id),
    );
  if (deleteError) throw deleteError;
}

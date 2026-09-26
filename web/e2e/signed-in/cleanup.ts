import { apiAs, context } from './rls/helpers';

// Cleanup goes through the API as the owner: a delete in the interface waits out its undo window, past the test.
const BUCKET = 'item-images';

/** Each entry's objects, then the entries: the rows first would leave the files unnamed. */
async function removeEntries(itemIds: string[]) {
  if (itemIds.length === 0) return;
  const { token, userId } = context();
  const api = apiAs(token);
  for (const itemId of itemIds) {
    const prefix = `${userId}/${itemId}`;
    const { data: objects, error } = await api.storage
      .from(BUCKET)
      .list(prefix);
    if (error) throw error;
    if (objects.length === 0) continue;
    const { error: removeError } = await api.storage
      .from(BUCKET)
      .remove(objects.map((object) => `${prefix}/${object.name}`));
    if (removeError) throw removeError;
  }
  const { error } = await api.from('items').delete().in('id', itemIds);
  if (error) throw error;
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

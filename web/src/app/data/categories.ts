import { chunk } from '../lib/chunk';
import { readAllChunks, readAllPages } from '../lib/pages';
import { supabase } from '../supabase';
import type { Database } from './database.types';
import type { ShareRole } from './shares';

type CategoryRow = Database['public']['Tables']['categories']['Row'];
// category_shares is RLS-scoped to the caller's own role; a missing array reads as empty.
export type CategorySummary = Pick<CategoryRow, 'id' | 'name' | 'user_id'> & {
  category_shares?: { role: ShareRole }[];
};
type CategoryCore = Pick<CategoryRow, 'id' | 'name' | 'user_id'>;

/** `base`, or `base (2)`, `base (3)`, ... past every name, case-insensitive like the unique index. */
export function uniqueCategoryName(
  base: string,
  existingNames: string[],
): string {
  const taken = new Set(existingNames.map((name) => name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  // `base` is itself taken, so at most `taken.size - 1` candidates can be: one is always free.
  return Array.from(
    { length: taken.size },
    (_, i) => `${base} (${i + 2})`,
  ).find((candidate) => !taken.has(candidate.toLowerCase()))!;
}

export function listCategories() {
  return supabase
    .from('categories')
    .select('id,name,user_id,category_shares(role)')
    .overrideTypes<CategorySummary[], { merge: false }>();
}

export function createCategory(name: string) {
  return (
    supabase
      .from('categories')
      // user_id is never sent: enforce_user_id() fills it from the JWT, so no row changes hands.
      .insert({ name } as Database['public']['Tables']['categories']['Insert'])
      .select('id,name,user_id')
      .single<CategoryCore>()
  );
}

// A trigger normalises the name, so callers merge the returned row; category_shares stays unselected.
export function renameCategory(id: string, name: string) {
  return supabase
    .from('categories')
    .update({ name })
    .eq('id', id)
    .select('id,name,user_id')
    .single<CategoryCore>();
}

export function deleteCategory(id: string) {
  return supabase.from('categories').delete().eq('id', id);
}

// PostgREST caps an unranged request at max_rows (supabase/config.toml) and truncates silently.
const ITEM_LINK_PAGE_SIZE = 1000;

// Ids per `.in()` filter; more risks a URL length limit before the row cap.
const ID_FILTER_CHUNK_SIZE = 100;

function rawListItemIdsForCategory({
  categoryId,
  from,
  to,
}: {
  categoryId: string;
  from: number;
  to: number;
}) {
  return supabase
    .from('item_categories')
    .select('item_id')
    .eq('category_id', categoryId)
    .range(from, to);
}

/** Every item id linked to this category, paged past the row cap; `listPage` exists for the test. */
export async function listItemIdsForCategory(
  categoryId: string,
  listPage: typeof rawListItemIdsForCategory = rawListItemIdsForCategory,
): Promise<{ data: string[] | null; error: unknown }> {
  const paged = await readAllPages<{ item_id: string }>(
    ITEM_LINK_PAGE_SIZE,
    (from, to) => listPage({ categoryId, from, to }),
  );
  if (paged.error !== null) return { data: null, error: paged.error };
  return { data: paged.data.map((row) => row.item_id), error: null };
}

// Exact count with no rows fetched, for the confirmation dialog.
export function countItemsForCategory(categoryId: string) {
  return supabase
    .from('item_categories')
    .select('item_id', { count: 'exact', head: true })
    .eq('category_id', categoryId);
}

function rawListItemIdsLinkedElsewhere({
  itemIds,
  excludingCategoryId,
  from,
  to,
}: {
  itemIds: string[];
  excludingCategoryId: string;
  from: number;
  to: number;
}) {
  return supabase
    .from('item_categories')
    .select('item_id')
    .in('item_id', itemIds)
    .neq('category_id', excludingCategoryId)
    .range(from, to);
}

/** Which items would NOT be orphaned; on `error` abort the deletion rather than act on a partial set. */
export async function listItemIdsLinkedElsewhere(
  itemIds: string[],
  excludingCategoryId: string,
  listPage: typeof rawListItemIdsLinkedElsewhere = rawListItemIdsLinkedElsewhere,
): Promise<{ data: string[] | null; error: unknown }> {
  const rows = await readAllChunks(
    chunk(itemIds, ID_FILTER_CHUNK_SIZE),
    (ids) =>
      readAllPages<{ item_id: string }>(ITEM_LINK_PAGE_SIZE, (from, to) =>
        listPage({ itemIds: ids, excludingCategoryId, from, to }),
      ),
  );
  if (rows.error !== null) return { data: null, error: rows.error };
  return {
    data: Array.from(new Set(rows.data.map((row) => row.item_id))),
    error: null,
  };
}

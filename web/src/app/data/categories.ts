import { chunk } from '../lib/chunk';
import { MAX_CATEGORY_NAME_LENGTH } from '../lib/textLimits';
import { readAllChunks, readAllKeysetPages } from '../lib/pages';
import { supabase } from '../supabase';
import type { Database } from './database.types';
import { rowsAfterFilter } from './keyset';
import type { ShareRole } from './shares';

type CategoryRow = Database['public']['Tables']['categories']['Row'];
// category_shares is RLS-scoped to the caller's own role; a missing array reads as empty.
export type CategorySummary = Pick<CategoryRow, 'id' | 'name' | 'user_id'> & {
  category_shares?: { role: ShareRole }[];
};
type CategoryCore = Pick<CategoryRow, 'id' | 'name' | 'user_id'>;

/** UX only, RLS decides: the owner, or a grantee whose own share row says `editor`. */
export function canEditCategory(
  category: CategorySummary,
  userId: string,
): boolean {
  if (category.user_id === userId) return true;
  return (
    category.category_shares?.some((share) => share.role === 'editor') ?? false
  );
}

/** `base` cut so that `suffix` still fits the name limit, counted in code points as `char_length` counts. */
function fitName(base: string, suffix: string): string {
  const room = MAX_CATEGORY_NAME_LENGTH - suffix.length;
  // Trimmed, as the normalising trigger would, so the name checked is the name stored.
  const fitted = Array.from(base).slice(0, room).join('').trimEnd();
  return `${fitted}${suffix}`;
}

/** `base`, or `base (2)`, `base (3)`, ... past every name, case-insensitive like the unique index, within the length limit. */
export function uniqueCategoryName(
  base: string,
  existingNames: string[],
): string {
  const taken = new Set(existingNames.map((name) => name.toLowerCase()));
  const name = fitName(base, '');
  if (!taken.has(name.toLowerCase())) return name;
  // `name` is itself taken, so at most `taken.size - 1` candidates can be: one is always free.
  return Array.from({ length: taken.size }, (_, i) =>
    fitName(base, ` (${i + 2})`),
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

type CategoryLink = { item_id: string; created_at: string };

// Keyset-paged oldest-first on idx_item_categories_cat_created, the export's order; a link added mid-walk lands last.
function rawListItemIdsForCategory({
  categoryId,
  after,
}: {
  categoryId: string;
  after: CategoryLink | null;
}) {
  let query = supabase
    .from('item_categories')
    .select('item_id,created_at')
    .eq('category_id', categoryId);
  if (after) {
    // The gte lets the index scan start at the key; the or=() drops the ties already read.
    query = query
      .gte('created_at', after.created_at)
      .or(
        rowsAfterFilter(
          { column: 'created_at', value: after.created_at },
          { column: 'item_id', value: after.item_id },
        ),
      );
  }
  return query.order('created_at').order('item_id').limit(ITEM_LINK_PAGE_SIZE);
}

/** Every item id linked to this category, paged past the row cap; `listPage` exists for the test. */
export async function listItemIdsForCategory(
  categoryId: string,
  listPage: typeof rawListItemIdsForCategory = rawListItemIdsForCategory,
): Promise<{ data: string[] | null; error: unknown }> {
  const paged = await readAllKeysetPages<CategoryLink>(
    ITEM_LINK_PAGE_SIZE,
    (after) => listPage({ categoryId, after }),
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

type ItemLink = { item_id: string; category_id: string };

// Keyset-paged on the primary key (item_id, category_id), which also serves the `.in()`.
function rawListItemIdsLinkedElsewhere({
  itemIds,
  excludingCategoryId,
  after,
}: {
  itemIds: string[];
  excludingCategoryId: string;
  after: ItemLink | null;
}) {
  let query = supabase
    .from('item_categories')
    .select('item_id,category_id')
    .in('item_id', itemIds)
    .neq('category_id', excludingCategoryId);
  if (after) {
    query = query
      .gte('item_id', after.item_id)
      .or(
        rowsAfterFilter(
          { column: 'item_id', value: after.item_id },
          { column: 'category_id', value: after.category_id },
        ),
      );
  }
  return query.order('item_id').order('category_id').limit(ITEM_LINK_PAGE_SIZE);
}

/** Which items would NOT be orphaned; on `error` abort the deletion rather than act on a partial set. */
export async function listItemIdsLinkedElsewhere(
  {
    itemIds,
    excludingCategoryId,
  }: { itemIds: string[]; excludingCategoryId: string },
  listPage: typeof rawListItemIdsLinkedElsewhere = rawListItemIdsLinkedElsewhere,
): Promise<{ data: string[] | null; error: unknown }> {
  const rows = await readAllChunks(
    chunk(itemIds, ID_FILTER_CHUNK_SIZE),
    (ids) =>
      readAllKeysetPages<ItemLink>(ITEM_LINK_PAGE_SIZE, (after) =>
        listPage({ itemIds: ids, excludingCategoryId, after }),
      ),
  );
  if (rows.error !== null) return { data: null, error: rows.error };
  return {
    data: Array.from(new Set(rows.data.map((row) => row.item_id))),
    error: null,
  };
}

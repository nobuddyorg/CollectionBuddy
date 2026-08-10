import { supabase } from '../supabase';
import type { Database } from './database.types';

export type CategoryRow = Database['public']['Tables']['categories']['Row'];
export type CategorySummary = Pick<CategoryRow, 'id' | 'name'>;

export function listCategories() {
  return supabase
    .from('categories')
    .select('id,name')
    .returns<CategorySummary[]>();
}

export function createCategory(name: string) {
  return (
    supabase
      .from('categories')
      // The generated Insert type requires user_id because the column is
      // `not null` with no default -- it doesn't know enforce_user_id()
      // (0002_functions.sql) fills it in from the JWT on every insert. The
      // client never sends it, on purpose: RLS plus that trigger is what
      // makes it impossible to hand a row to another user.
      .insert({ name } as Database['public']['Tables']['categories']['Insert'])
      .select('id,name')
      .single<CategorySummary>()
  );
}

// Permitted by the "update own categories" RLS policy; a trigger keeps
// updated_at current and normalises the name, so the returned row -- not
// the value sent -- is what should be merged into local state.
export function renameCategory(id: string, name: string) {
  return supabase
    .from('categories')
    .update({ name })
    .eq('id', id)
    .select('id,name')
    .single<CategorySummary>();
}

export function deleteCategory(id: string) {
  return supabase.from('categories').delete().eq('id', id);
}

// PostgREST caps an unranged request at max_rows (supabase/config.toml,
// 1000 -- confirmed the same on the hosted project's API settings, #408
// step 0) and truncates silently. This table carries one id per row, so a
// page already asks for as much as one request can return.
const ITEM_LINK_PAGE_SIZE = 1000;

// How many ids ride in one `.in()` filter's query string. Same precedent as
// exportCategory.ts's SIGN_BATCH_SIZE: a few thousand UUIDs would hit a URL
// length limit long before the row cap did.
const ID_FILTER_CHUNK_SIZE = 100;

function rawListItemIdsForCategory(
  categoryId: string,
  from: number,
  to: number,
) {
  return supabase
    .from('item_categories')
    .select('item_id')
    .eq('category_id', categoryId)
    .range(from, to);
}

/**
 * Every item id linked to this category, used to find what a category
 * deletion would orphan. Paged past PostgREST's row cap -- unpaginated, this
 * silently undercounted a category above the cap, and the missing ids came
 * out the other end of `listItemIdsLinkedElsewhere` looking orphaned when
 * they were not (#409).
 *
 * `listPage` is accepted as a parameter, same shape as exportCategory.ts's
 * `fetchAllItems`, so the paging loop can be driven with a fake instead of a
 * real database.
 */
export async function listItemIdsForCategory(
  categoryId: string,
  listPage: typeof rawListItemIdsForCategory = rawListItemIdsForCategory,
): Promise<{ data: string[] | null; error: unknown }> {
  const ids: string[] = [];
  for (let page = 0; ; page++) {
    const from = page * ITEM_LINK_PAGE_SIZE;
    const { data, error } = await listPage(
      categoryId,
      from,
      from + ITEM_LINK_PAGE_SIZE - 1,
    );
    if (error) return { data: null, error };
    if (!data?.length) break;
    ids.push(...data.map((row) => row.item_id));
    if (data.length < ITEM_LINK_PAGE_SIZE) break;
  }
  return { data: ids, error: null };
}

// An exact count with no rows fetched, so the delete-confirmation dialog can
// name the number of entries at risk without paying for the full listing
// `listItemIdsForCategory` above returns once the deletion is confirmed.
export function countItemsForCategory(categoryId: string) {
  return supabase
    .from('item_categories')
    .select('item_id', { count: 'exact', head: true })
    .eq('category_id', categoryId);
}

function rawListItemIdsLinkedElsewhere(
  itemIds: string[],
  excludingCategoryId: string,
  from: number,
  to: number,
) {
  return supabase
    .from('item_categories')
    .select('item_id')
    .in('item_id', itemIds)
    .neq('category_id', excludingCategoryId)
    .range(from, to);
}

/**
 * Of the given items, which are still linked to some category other than the
 * one being deleted -- i.e. which of them would NOT be orphaned.
 *
 * Chunks the id list (a URL-length concern) and pages each chunk (a row-cap
 * concern) so neither truncates the answer. Pagination alone is not the
 * whole fix for #409: the caller still has to treat an `error` here as a
 * reason to abort the deletion rather than act on a partial `keep` set --
 * this only guarantees that a *successful* answer is a complete one.
 *
 * `listPage` is accepted the same way `listItemIdsForCategory` above accepts
 * `listPage`, for the same testing reason.
 */
export async function listItemIdsLinkedElsewhere(
  itemIds: string[],
  excludingCategoryId: string,
  listPage: typeof rawListItemIdsLinkedElsewhere = rawListItemIdsLinkedElsewhere,
): Promise<{ data: string[] | null; error: unknown }> {
  const linked = new Set<string>();
  for (let i = 0; i < itemIds.length; i += ID_FILTER_CHUNK_SIZE) {
    const chunk = itemIds.slice(i, i + ID_FILTER_CHUNK_SIZE);
    for (let page = 0; ; page++) {
      const from = page * ITEM_LINK_PAGE_SIZE;
      const { data, error } = await listPage(
        chunk,
        excludingCategoryId,
        from,
        from + ITEM_LINK_PAGE_SIZE - 1,
      );
      if (error) return { data: null, error };
      if (!data?.length) break;
      for (const row of data) linked.add(row.item_id);
      if (data.length < ITEM_LINK_PAGE_SIZE) break;
    }
  }
  return { data: Array.from(linked), error: null };
}

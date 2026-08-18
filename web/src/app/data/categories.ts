import { supabase } from '../supabase';
import type { Database } from './database.types';
import type { ShareRole } from './shares';

export type CategoryRow = Database['public']['Tables']['categories']['Row'];
// user_id distinguishes "mine" from "shared with me". category_shares is
// scoped by RLS to the caller's own role; treat a missing array the same as
// an empty one, see page.tsx's canEditSelected.
export type CategorySummary = Pick<CategoryRow, 'id' | 'name' | 'user_id'> & {
  category_shares?: { role: ShareRole }[];
};
type CategoryCore = Pick<CategoryRow, 'id' | 'name' | 'user_id'>;

/**
 * Returns `base`, or `base (2)`, `base (3)`, ... past every name in
 * `existingNames`, matching case-insensitively like the database's unique
 * index on `categories.name` so an import can't collide on insert.
 */
export function uniqueCategoryName(
  base: string,
  existingNames: string[],
): string {
  const taken = new Set(existingNames.map((n) => n.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} (${n})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

export function listCategories() {
  return supabase
    .from('categories')
    .select('id,name,user_id,category_shares(role)')
    .returns<CategorySummary[]>();
}

export function createCategory(name: string) {
  return (
    supabase
      .from('categories')
      // user_id is required by the generated Insert type, but the client
      // never sends it: enforce_user_id() fills it from the JWT, so RLS
      // can't be handed another user's id.
      .insert({ name } as Database['public']['Tables']['categories']['Insert'])
      .select('id,name,user_id')
      .single<CategoryCore>()
  );
}

// A trigger normalises the name and updates updated_at, so merge the
// returned row, not the sent value. No category_shares in the select: the
// merge treats a missing key as unchanged, not cleared.
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

// PostgREST caps an unranged request at max_rows (1000, supabase/config.toml)
// and truncates silently.
const ITEM_LINK_PAGE_SIZE = 1000;

// Ids per `.in()` filter; more risks hitting a URL length limit before the
// row cap does.
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
 * deletion would orphan. Paged past PostgREST's row cap to avoid silently
 * undercounting. `listPage` is a parameter so the paging loop can be driven
 * with a fake instead of a real database.
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

// Exact count with no rows fetched, so the confirmation dialog can show the
// number at risk without the full scan listItemIdsForCategory does.
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
 * one being deleted, i.e. which would NOT be orphaned. Chunks the id list
 * (URL length) and pages each chunk (row cap) so neither truncates the
 * answer. Callers must still treat an `error` as a reason to abort the
 * deletion rather than act on a partial `keep` set.
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

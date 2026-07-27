import { supabase } from '../supabase';
import type { Database } from './database.types';

export type ItemRow = Database['public']['Tables']['items']['Row'];
export type ItemInsert = Database['public']['Tables']['items']['Insert'];
export type ItemUpdate = Database['public']['Tables']['items']['Update'];

export type ItemFields = Pick<
  ItemRow,
  'id' | 'title' | 'description' | 'place' | 'tags'
>;
export type ItemSearchRow = ItemFields & {
  item_categories: { category_id: string }[];
};

const ITEMS_SEARCH_SELECT =
  'id,title,description,place,tags,item_categories!inner(category_id)';
const ITEM_FIELDS_SELECT = 'id,title,description,place,tags';

// Escape LIKE metacharacters first, then quote the value so that
// PostgREST's or=() grammar (which treats , . ( ) as structural
// delimiters) sees one opaque string instead of parsing the search term
// as extra filter conditions.
export function buildSearchFilter(needle: string): string {
  const likeEscaped = needle.replace(/\\/g, '\\\\').replace(/[%_]/g, '\\$&');
  const like = `%${likeEscaped}%`;
  const quoted = like.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `title.ilike."${quoted}",description.ilike."${quoted}",place.ilike."${quoted}",tags_text.ilike."${quoted}"`;
}

export function listItems({
  categoryId,
  search,
  from,
  to,
}: {
  categoryId: string;
  search: string;
  from: number;
  to: number;
}) {
  let query = supabase
    .from('items')
    .select(ITEMS_SEARCH_SELECT, { count: 'exact' })
    .eq('item_categories.category_id', categoryId);

  // Below 3 characters the trigram indexes can't produce any candidates
  // (ILIKE %q% needs at least one 3-char trigram to seed a bitmap scan),
  // so a 1-2 char search would force a sequential scan on every keystroke
  // for no benefit. Same threshold PlaceAutocomplete already uses.
  if (search.length >= 3) {
    query = query.or(buildSearchFilter(search));
  }

  return query
    .order('created_at', { ascending: false })
    .range(from, to)
    .returns<ItemSearchRow[]>();
}

export function createItem(
  payload: Pick<ItemInsert, 'title' | 'description' | 'place' | 'tags'>,
) {
  return supabase
    .from('items')
    .insert(payload)
    .select('id')
    .single<{ id: string }>();
}

export function updateItem(
  id: string,
  payload: Pick<ItemUpdate, 'title' | 'description' | 'place' | 'tags'>,
) {
  return supabase
    .from('items')
    .update(payload)
    .eq('id', id)
    .select(ITEM_FIELDS_SELECT)
    .single<ItemFields>();
}

export function deleteItem(id: string) {
  return supabase.from('items').delete().eq('id', id);
}

export function linkItemToCategory(itemId: string, categoryId: string) {
  return supabase
    .from('item_categories')
    .insert({ item_id: itemId, category_id: categoryId });
}

export function listItemPlaces(categoryId: string) {
  return supabase
    .from('items')
    .select('place,item_categories!inner(category_id)')
    .eq('item_categories.category_id', categoryId)
    .not('place', 'is', null)
    .neq('place', '');
}

import { supabase } from '../supabase';
import type { Database } from './database.types';

export type ItemRow = Database['public']['Tables']['items']['Row'];
export type ItemInsert = Database['public']['Tables']['items']['Insert'];
export type ItemUpdate = Database['public']['Tables']['items']['Update'];

export type ItemFields = Pick<
  ItemRow,
  'id' | 'title' | 'description' | 'place' | 'place_lat' | 'place_lng' | 'tags'
>;
export type ItemSearchRow = ItemFields & {
  item_categories: { category_id: string }[];
};

/** A place as stored on an item, for the map to draw without geocoding. */
export type ItemPlaceRow = Pick<ItemRow, 'place' | 'place_lat' | 'place_lng'>;

/* v8 ignore start -- only used by the ignored query builders below. */
// Stryker disable all: only used by the ignored query builders below.
// The coordinates come back with every item read so the edit form can hand
// them straight back on save -- an item edited without touching its place
// must keep the pin it already had.
const ITEMS_SEARCH_SELECT =
  'id,title,description,place,place_lat,place_lng,tags,item_categories!inner(category_id)';
const ITEM_FIELDS_SELECT =
  'id,title,description,place,place_lat,place_lng,tags';
// Stryker restore all
/* v8 ignore stop */

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

// Below 3 characters the trigram indexes can't produce any candidates
// (ILIKE %q% needs at least one 3-char trigram to seed a bitmap scan), so a
// 1-2 char search would force a sequential scan on every keystroke for no
// benefit. Same threshold PlaceAutocomplete already uses.
export const SEARCH_MIN_LENGTH = 3;

/**
 * The filter a search term earns, or null for a term too short to be worth
 * one.
 *
 * Shared rather than restated at each call site because the list and the map
 * are two views of one filtered set: the moment they disagree about what
 * counts as a search, the map shows pins for entries the list is hiding
 * (#241). Every query that narrows by search goes through here.
 */
export function searchFilterFor(search: string): string | null {
  return search.length >= SEARCH_MIN_LENGTH ? buildSearchFilter(search) : null;
}

/* v8 ignore start -- thin Supabase query builders; buildSearchFilter and
 * searchFilterFor above are what's gated and mutation-tested. The two list
 * builders do have tests, but of the request they compose rather than of
 * running them, so they stay outside the line-coverage gate. */
// Stryker disable all: what these builders are held to is the shape of the
// query, not their lines -- mutants in here would only be noise.
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

  const filter = searchFilterFor(search);
  if (filter) query = query.or(filter);

  return query
    .order('created_at', { ascending: false })
    .range(from, to)
    .returns<ItemSearchRow[]>();
}

export function createItem(
  payload: Pick<
    ItemInsert,
    'title' | 'description' | 'place' | 'place_lat' | 'place_lng' | 'tags'
  >,
) {
  return supabase
    .from('items')
    .insert(payload)
    .select('id')
    .single<{ id: string }>();
}

export function updateItem(
  id: string,
  payload: Pick<
    ItemUpdate,
    'title' | 'description' | 'place' | 'place_lat' | 'place_lng' | 'tags'
  >,
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

// Narrowed by the same search as the list, so the map is the same set of
// entries seen from above rather than a second, wider one. Not paginated,
// though: a page is how many cards fit on a screen, which has nothing to say
// about how many pins fit on a map.
export function listItemPlaces(categoryId: string, search: string) {
  let query = supabase
    .from('items')
    .select('place,place_lat,place_lng,item_categories!inner(category_id)')
    .eq('item_categories.category_id', categoryId)
    .not('place', 'is', null)
    .neq('place', '');

  const filter = searchFilterFor(search);
  if (filter) query = query.or(filter);

  return query.returns<ItemPlaceRow[]>();
}
// Stryker restore all
/* v8 ignore stop */

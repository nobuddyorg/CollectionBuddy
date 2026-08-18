import { supabase } from '../supabase';
import type { Database } from './database.types';

export type ItemRow = Database['public']['Tables']['items']['Row'];
export type ItemInsert = Database['public']['Tables']['items']['Insert'];
export type ItemUpdate = Database['public']['Tables']['items']['Update'];

// Single source for both the field list and the `.select()` string built
// from it below, so a dropped field can't silently vanish from responses
// while TypeScript still believes it's there -- `.returns<T>()` is an
// assertion, not a check.
export const ITEM_FIELD_KEYS = [
  'id',
  'title',
  'description',
  'place',
  'place_lat',
  'place_lng',
  'tags',
] as const;
export type ItemFields = Pick<ItemRow, (typeof ITEM_FIELD_KEYS)[number]>;
export type ItemEditableFieldKey = Exclude<
  (typeof ITEM_FIELD_KEYS)[number],
  'id'
>;
export type ItemSearchRow = ItemFields & {
  item_categories: { category_id: string }[];
};

/**
 * A place as stored on an item, for the map to draw without geocoding.
 * `title` rides along so a pin's popup can name the entries catalogued
 * there; `id` so a geocoded place can be written back onto its row instead
 * of repeating the lookup on every map open.
 */
export const ITEM_PLACE_FIELD_KEYS = [
  'id',
  'title',
  'place',
  'place_lat',
  'place_lng',
] as const;
export type ItemPlaceRow = Pick<
  ItemRow,
  (typeof ITEM_PLACE_FIELD_KEYS)[number]
>;

/* v8 ignore start -- only used by the ignored query builders below. */
// Stryker disable all: only used by the ignored query builders below.
// Coordinates come back with every item read so an item edited without
// touching its place keeps the pin it already had.
const ITEM_FIELDS_SELECT = ITEM_FIELD_KEYS.join(',');
const ITEMS_SEARCH_SELECT = `${ITEM_FIELDS_SELECT},item_categories!inner(category_id)`;
const ITEM_PLACE_FIELDS_SELECT = ITEM_PLACE_FIELD_KEYS.join(',');
// Stryker restore all
/* v8 ignore stop */

// Escape LIKE metacharacters first, then quote the value so PostgREST's
// or=() grammar (which treats , . ( ) as structural delimiters) sees one
// opaque string instead of parsing the term as extra filter conditions.
export function buildSearchFilter(needle: string): string {
  const likeEscaped = needle.replace(/\\/g, '\\\\').replace(/[%_]/g, '\\$&');
  const like = `%${likeEscaped}%`;
  const quoted = like.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `title.ilike."${quoted}",description.ilike."${quoted}",place.ilike."${quoted}",tags_text.ilike."${quoted}"`;
}

// Below 3 characters the trigram indexes can't produce any candidates
// (ILIKE %q% needs at least one 3-char trigram to seed a bitmap scan), so a
// 1-2 char search would force a sequential scan on every keystroke.
export const SEARCH_MIN_LENGTH = 3;

// A non-ASCII character (CJK, Cyrillic, a currency symbol) carries more
// meaning per character than a Latin letter, so the floor is lower. A plain
// two-letter ASCII term still waits for a third character; that gap is
// accepted, not closed, since closing it gives up the scan-cost argument.
export const SEARCH_MIN_LENGTH_NON_ASCII = 2;

const NON_ASCII_PATTERN = /[^\x00-\x7F]/;

/** The minimum length `search` needs before it earns a filter. */
export function searchMinLength(search: string): number {
  return NON_ASCII_PATTERN.test(search)
    ? SEARCH_MIN_LENGTH_NON_ASCII
    : SEARCH_MIN_LENGTH;
}

/**
 * The filter a search term earns, or null for a term too short to be worth
 * one. Shared rather than restated at each call site: the list and the map
 * are two views of one filtered set, and if they disagreed about what
 * counts as a search the map would show pins for entries the list hides.
 */
export function searchFilterFor(search: string): string | null {
  return search.length >= searchMinLength(search)
    ? buildSearchFilter(search)
    : null;
}

/* v8 ignore start -- thin Supabase query builders; buildSearchFilter and
 * searchFilterFor above are what's gated and mutation-tested. */
// Stryker disable all: what these builders are held to is the shape of the
// query, not their lines.
export function listItems({
  categoryId,
  search,
  from,
  to,
  signal,
}: {
  categoryId: string;
  search: string;
  from: number;
  to: number;
  /** Aborts a request superseded by a newer one, so the bytes don't finish
   * downloading for nothing. */
  signal?: AbortSignal;
}) {
  // `count: 'exact'` runs a full COUNT on every call, including every
  // debounced keystroke -- kept fast by the trigram GIN indexes
  // (migrations/0005). Revisit with `count: 'estimated'` if search gets
  // slow on a large collection.
  let query = supabase
    .from('items')
    .select(ITEMS_SEARCH_SELECT, { count: 'exact' })
    .eq('item_categories.category_id', categoryId);

  const filter = searchFilterFor(search);
  if (filter) query = query.or(filter);
  if (signal) query = query.abortSignal(signal);

  return query
    .order('created_at', { ascending: false })
    .range(from, to)
    .returns<ItemSearchRow[]>();
}

export function createItem(payload: Pick<ItemInsert, ItemEditableFieldKey>) {
  return (
    supabase
      .from('items')
      // user_id is never sent: enforce_user_id() (0002_functions.sql) fills
      // it in from the JWT on every insert. RLS plus that trigger is what
      // makes it impossible to hand a row to another user.
      .insert(payload as ItemInsert)
      .select('id')
      .single<{ id: string }>()
  );
}

export function updateItem(
  id: string,
  payload: Pick<ItemUpdate, ItemEditableFieldKey>,
) {
  return supabase
    .from('items')
    .update(payload)
    .eq('id', id)
    .select(ITEM_FIELDS_SELECT)
    .single<ItemFields>();
}

// `.select().single()` turns an RLS-refused delete (zero rows affected,
// which a bare `.delete()` reports as `{ error: null }`) into an error a
// caller can see.
export function deleteItem(id: string) {
  return supabase
    .from('items')
    .delete()
    .eq('id', id)
    .select('id')
    .single<{ id: string }>();
}

export function linkItemToCategory(itemId: string, categoryId: string) {
  return supabase.from('item_categories').insert({
    item_id: itemId,
    category_id: categoryId,
    // tg_item_categories_enforce() derives and rechecks this from the
    // item/category it links, not from the client.
  } as Database['public']['Tables']['item_categories']['Insert']);
}

// Narrowed by the same search as the list, so the map is the same set of
// entries seen from above. The map wants every row, not a screenful, so
// this pages past PostgREST's row cap rather than taking whatever
// `max_rows` hands back.
export function rawListItemPlaces(
  categoryId: string,
  search: string,
  from: number,
  to: number,
  signal?: AbortSignal,
) {
  let query = supabase
    .from('items')
    .select(`${ITEM_PLACE_FIELDS_SELECT},item_categories!inner(category_id)`)
    .eq('item_categories.category_id', categoryId)
    .not('place', 'is', null)
    .neq('place', '');

  const filter = searchFilterFor(search);
  if (filter) query = query.or(filter);
  if (signal) query = query.abortSignal(signal);

  // Newest first, the same order the list uses -- the two readings of one
  // collection should not disagree about which entry comes first.
  return query
    .order('created_at', { ascending: false })
    .range(from, to)
    .returns<ItemPlaceRow[]>();
}

// Unfiltered by the search box on purpose: an export is of a category, not
// of whatever happens to be typed into the field when the button is
// pressed. Ordered oldest-first, the reverse of the list, so the archive
// numbers its folders from the collection's first entry and stays stable
// across re-exports. `created_at` alone isn't unique -- rows from the same
// transaction can share a timestamp, and Postgres gives ties no stable
// order across a .range() boundary -- so `id` breaks ties deterministically.
export function listItemsForExport(
  categoryId: string,
  from: number,
  to: number,
) {
  return supabase
    .from('items')
    .select(
      `${ITEM_FIELDS_SELECT},created_at,item_categories!inner(category_id)`,
    )
    .eq('item_categories.category_id', categoryId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .range(from, to)
    .returns<ExportItemRow[]>();
}
// Stryker restore all
/* v8 ignore stop */

export type ExportItemRow = ItemFields & { created_at: string };

// PostgREST caps an unranged request at max_rows (supabase/config.toml,
// 1000) and truncates silently, so that's the page size a map request uses.
export const ITEM_PLACE_PAGE_SIZE = 1000;

/**
 * Walks every page of a category's places. Lives here rather than beside
 * its caller (`usePlaces.tsx`) because the raw builder it pages is private
 * to this module. `listPage` is a parameter so the pagination boundary can
 * be driven with a fake page sequence instead of a real database.
 */
export async function listItemPlaces(
  categoryId: string,
  search: string,
  signal?: AbortSignal,
  listPage: typeof rawListItemPlaces = rawListItemPlaces,
): Promise<{ data: ItemPlaceRow[] | null; error: unknown }> {
  const rows: ItemPlaceRow[] = [];
  for (let page = 0; ; page++) {
    const from = page * ITEM_PLACE_PAGE_SIZE;
    const { data, error } = await listPage(
      categoryId,
      search,
      from,
      from + ITEM_PLACE_PAGE_SIZE - 1,
      signal,
    );
    if (error) return { data: null, error };
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < ITEM_PLACE_PAGE_SIZE) break;
  }
  return { data: rows, error: null };
}

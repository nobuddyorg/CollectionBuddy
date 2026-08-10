import { supabase } from '../supabase';
import type { Database } from './database.types';

export type ItemRow = Database['public']['Tables']['items']['Row'];
export type ItemInsert = Database['public']['Tables']['items']['Insert'];
export type ItemUpdate = Database['public']['Tables']['items']['Update'];

// The single source for both the `items` field list and the wire-format
// select string built from it below -- so dropping a field here can't leave
// a `.select()` string one field short of the type asserted onto its
// response. Before this, ITEM_FIELDS_SELECT and ITEM_FIELDS were two
// independent copies of the same six names: drop one from the select
// string and TypeScript still believed every row had it, `useItems.tsx`
// substituted a default for the now-missing column, and every card lost
// that field with no error anywhere -- `.returns<T>()` is an assertion, not
// a check.
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
// What a create/update payload carries: every field but the id the row
// gets assigned on insert.
export type ItemEditableFieldKey = Exclude<
  (typeof ITEM_FIELD_KEYS)[number],
  'id'
>;
export type ItemSearchRow = ItemFields & {
  item_categories: { category_id: string }[];
};

/**
 * A place as stored on an item, for the map to draw without geocoding.
 *
 * The title rides along because a pin is not just a dot on a city: it
 * stands for the entries catalogued there, and the popup names them (#404).
 */
export const ITEM_PLACE_FIELD_KEYS = [
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
// The coordinates come back with every item read so the edit form can hand
// them straight back on save -- an item edited without touching its place
// must keep the pin it already had.
const ITEM_FIELDS_SELECT = ITEM_FIELD_KEYS.join(',');
const ITEMS_SEARCH_SELECT = `${ITEM_FIELDS_SELECT},item_categories!inner(category_id)`;
const ITEM_PLACE_FIELDS_SELECT = ITEM_PLACE_FIELD_KEYS.join(',');
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

// A term with any non-ASCII character in it -- a CJK ideograph, a Cyrillic
// letter, a currency symbol like "€" -- carries far more of its meaning per
// character than a Latin letter does, so the scan-cost argument above lands
// at a lower floor: two characters already narrow a trigram scan usefully.
// A plain two-letter ASCII term (a country code, say) still waits for a
// third character -- that's an accepted gap (#307), not one this can close
// without giving up the cost argument entirely.
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
 * one.
 *
 * Shared rather than restated at each call site because the list and the map
 * are two views of one filtered set: the moment they disagree about what
 * counts as a search, the map shows pins for entries the list is hiding
 * (#241). Every query that narrows by search goes through here.
 */
export function searchFilterFor(search: string): string | null {
  return search.length >= searchMinLength(search)
    ? buildSearchFilter(search)
    : null;
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
  signal,
}: {
  categoryId: string;
  search: string;
  from: number;
  to: number;
  /** Aborts the request once a newer one (the next keystroke, a category
   * switch) has already made this one's answer moot -- the sequence guard
   * in useItems.tsx discards a superseded response either way, but without
   * this the bytes still finish downloading for nothing. */
  signal?: AbortSignal;
}) {
  // `count: 'exact'` makes Postgres run a full COUNT over the filtered set
  // on every call, including every debounced keystroke -- genuinely free at
  // the collection sizes this app has actually seen (the trigram GIN
  // indexes over title/description/place/tags_text, migrations/0005, keep
  // even a filtered count fast), but a per-keystroke full count that grows
  // with the collection. Worth revisiting with `count: 'planned'` or
  // `'estimated'` -- an approximate page count, in exchange for dropping
  // the per-request COUNT -- only if someone actually reports slow search
  // on a large collection.
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
      // The generated Insert type requires user_id because the column itself
      // is `not null` with no default -- it doesn't know enforce_user_id()
      // (0002_functions.sql) fills it in from the JWT on every insert. The
      // client never sends it, on purpose: RLS plus that trigger is what
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

// `.select().single()` turns an RLS-refused delete -- zero rows affected,
// which a bare `.delete()` reports as `{ error: null }` -- into an error a
// caller can actually see instead of silently doing nothing.
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
    // Same as createItem above: tg_item_categories_enforce() derives and
    // rechecks this from the item/category it links, not from the client.
  } as Database['public']['Tables']['item_categories']['Insert']);
}

// Narrowed by the same search as the list, so the map is the same set of
// entries seen from above rather than a second, wider one. Not paginated,
// though: a page is how many cards fit on a screen, which has nothing to say
// about how many pins fit on a map.
export function listItemPlaces(
  categoryId: string,
  search: string,
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

  // Newest first, the same order the list uses. A pin's popup now names the
  // entries catalogued at that place (#404), and the two readings of one
  // collection should not disagree about which of them comes first.
  return query
    .order('created_at', { ascending: false })
    .returns<ItemPlaceRow[]>();
}

// One page of a category's items for export. Unfiltered by the search box
// on purpose: an export is of a category, not of whatever happens to be
// typed into the field at the moment the button is pressed.
//
// Ordered oldest-first, the reverse of the list, because the archive
// numbers its folders in the order it walks them -- and a collection
// should be numbered from its first entry, so that exporting it again next
// year leaves 001 where it was instead of renumbering everything.
//
// `created_at` alone is not unique -- rows written in the same transaction
// or bulk operation can share a timestamp, and Postgres makes no stability
// guarantee for ties, so which page a tied row lands on (or whether it
// lands on either) was unspecified across a .range() boundary. `id` as a
// secondary sort gives every row a fixed position regardless of how many
// others share its `created_at`.
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

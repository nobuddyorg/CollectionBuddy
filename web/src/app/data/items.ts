import { chunk } from '../lib/chunk';
import { supabase } from '../supabase';
import type { Database } from './database.types';

type ItemRow = Database['public']['Tables']['items']['Row'];
export type ItemInsert = Database['public']['Tables']['items']['Insert'];
export type ItemUpdate = Database['public']['Tables']['items']['Update'];

// Single source for both the field list and the `.select()` string built
// from it below, so a dropped field can't silently vanish from responses
// while TypeScript still believes it's there -- `.overrideTypes<T, { merge:
// false }>()` is an assertion, not a check.
const ITEM_FIELD_KEYS = [
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
/** What a page read returns per matching `item_categories` row, before
 * `listItems` flattens it to the item itself. */
type ItemCategoryPageRow = { items: ItemFields };

/**
 * One distinct place in a category, already folded down from every item
 * catalogued there (`list_category_places`, 0014_list_category_places.sql)
 * instead of one row per item -- the map used to download the whole
 * category and do this fold on the client (#PERF-H5). `titles` names the
 * entries for the popup; `ids` is every item at this place, so a geocoded
 * result can be written back onto them instead of repeating the lookup on
 * the next map open. Both are newest-first, the same order the list uses.
 */
export interface PlaceGroupRow {
  place: string;
  place_lat: number | null;
  place_lng: number | null;
  titles: string[];
  ids: string[];
}

// Coordinates come back with every item read so an item edited without
// touching its place keeps the pin it already had.
const ITEM_FIELDS_SELECT = ITEM_FIELD_KEYS.join(',');
// Embeds items as the many-to-one side of item_categories rather than the
// other way around, so item_categories -- not items -- is the driving,
// top-level table. That is what lets .order() below sort and .range() page
// on item_categories' own created_at, walking idx_item_categories_cat_created
// (0013_item_categories_cat_created_idx.sql) instead of scanning every item
// in the category before sorting (#618, #619).
const ITEM_CATEGORY_PAGE_SELECT = `items!inner(${ITEM_FIELDS_SELECT})`;

// Escapes LIKE metacharacters (and a literal backslash, so it survives as
// one once ILIKE unescapes it) and wraps the term for a substring match.
// Shared by buildSearchFilter and likePatternFor below, so every reader of
// a search term -- the list, the map, and the searched-page RPC -- treats
// it identically.
function likePattern(needle: string): string {
  const likeEscaped = needle.replace(/\\/g, '\\\\').replace(/[%_]/g, '\\$&');
  return `%${likeEscaped}%`;
}

// Quotes the value so PostgREST's or=() grammar (which treats , . ( ) as
// structural delimiters) sees one opaque string instead of parsing the
// term as extra filter conditions.
export function buildSearchFilter(needle: string): string {
  const like = likePattern(needle);
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

/**
 * The raw ILIKE pattern a search term earns, or null for a term too short
 * to be worth one -- same gate as searchFilterFor, but as a plain value
 * for `list_category_places`' `like_pattern` argument rather than a
 * PostgREST or=() filter string.
 */
export function likePatternFor(search: string): string | null {
  return search.length >= searchMinLength(search) ? likePattern(search) : null;
}

/** `abortSignal` is typed as requiring a signal but only stores what it is
 * given, so an absent one needs no branch of its own at five call sites. */
function withSignal<T extends { abortSignal(signal: AbortSignal): T }>(
  query: T,
  signal: AbortSignal | undefined,
): T {
  return query.abortSignal(signal as AbortSignal);
}

export function rawListItems({
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
  // Driven from item_categories (see ITEM_CATEGORY_PAGE_SELECT above), with
  // category_id a plain column filter on that same top-level table rather
  // than an embedded-table one. The exact total lives in the separate,
  // cheaper rawCountItems request below (#PERF-H3) instead of riding along
  // here as `count: 'exact'`.
  let query = supabase
    .from('item_categories')
    .select(ITEM_CATEGORY_PAGE_SELECT)
    .eq('category_id', categoryId);

  const filter = searchFilterFor(search);
  if (filter) query = query.or(filter, { referencedTable: 'items' });

  return withSignal(query, signal)
    .order('created_at', { ascending: false })
    .range(from, to)
    .overrideTypes<ItemCategoryPageRow[], { merge: false }>();
}

/**
 * The page's exact total, asked for separately from `rawListItems`
 * (#PERF-H3). Counting through `items!inner(...)` pays for a join on every
 * row even with no search filter -- a plain `head: true` count on
 * `item_categories` alone measures ~15x cheaper (194 ms -> 13.3 ms at
 * 100,000 items). Only a search filter, which narrows on `items`' own
 * columns, needs that join back for the count to stay accurate.
 */
export function rawCountItems({
  categoryId,
  search,
  signal,
}: {
  categoryId: string;
  search: string;
  signal?: AbortSignal;
}) {
  const filter = searchFilterFor(search);
  if (!filter) {
    const query = supabase
      .from('item_categories')
      .select('item_id', { count: 'exact', head: true })
      .eq('category_id', categoryId);
    return withSignal(query, signal);
  }

  const query = supabase
    .from('item_categories')
    .select(ITEM_CATEGORY_PAGE_SELECT, { count: 'exact', head: true })
    .eq('category_id', categoryId)
    .or(filter, { referencedTable: 'items' });
  return withSignal(query, signal);
}

/**
 * The searched page and its exact total in one request, via
 * `search_category_items` (0015_search_category_items.sql) -- a `SECURITY
 * DEFINER` function that applies the read-access check itself and then
 * queries with RLS bypassed, since ILIKE can never use the trigram indexes
 * under RLS (#PERF-H4). Used only once a search term has earned a filter;
 * an unfiltered read stays on `rawListItems`/`rawCountItems` above, which
 * already perform well via idx_item_categories_cat_created (#618/#619) and
 * have no ILIKE clause to be blocked on.
 */
export function rawSearchCategoryItems({
  categoryId,
  likePattern,
  from,
  to,
  signal,
}: {
  categoryId: string;
  likePattern: string;
  from: number;
  to: number;
  signal?: AbortSignal;
}) {
  const query = supabase.rpc(
    'search_category_items',
    {
      cat_id: categoryId,
      like_pattern: likePattern,
      page_from: from,
      page_to: to,
    },
    { get: true },
  );
  return withSignal(query, signal).overrideTypes<
    SearchItemRow[],
    { merge: false }
  >();
}

type SearchItemRow = ItemFields & { total_count: number };

/**
 * The catalogue page: every item currently linked into `categoryId`,
 * newest first. A search that has earned a filter (likePatternFor) goes
 * through `search_category_items` instead -- one request rather than the
 * unfiltered path's two, since that RPC returns the exact total alongside
 * the rows (#PERF-H4). A thin flatten over `rawListItems`/`rawSearch...`
 * otherwise -- kept outside the ignored block above (unlike those builders)
 * because unwrapping the response is real logic worth a real test.
 * `rawList`/`rawCount`/`rawSearch` are parameters for exactly that test,
 * not for production callers.
 */
export async function listItems(
  params: {
    categoryId: string;
    search: string;
    from: number;
    to: number;
    signal?: AbortSignal;
  },
  rawList: typeof rawListItems = rawListItems,
  rawCount: typeof rawCountItems = rawCountItems,
  rawSearch: typeof rawSearchCategoryItems = rawSearchCategoryItems,
): Promise<{
  data: ItemFields[] | null;
  error: unknown;
  count: number | null;
}> {
  const likePattern = likePatternFor(params.search);
  if (likePattern) {
    const { data, error } = await rawSearch({
      categoryId: params.categoryId,
      likePattern,
      from: params.from,
      to: params.to,
      signal: params.signal,
    });
    if (error) return { data: null, error, count: null };
    const rows = data ?? [];
    const count = rows.length > 0 ? rows[0].total_count : 0;
    const items = rows.map(
      ({ id, title, description, place, place_lat, place_lng, tags }) => ({
        id,
        title,
        description,
        place,
        place_lat,
        place_lng,
        tags,
      }),
    );
    return { data: items, error: null, count };
  }

  const [{ data, error }, { count, error: countError }] = await Promise.all([
    rawList(params),
    rawCount(params),
  ]);
  if (error) return { data: null, error, count: null };
  if (countError) return { data: null, error: countError, count: null };
  return { data: (data ?? []).map((row) => row.items), error: null, count };
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

// One `.in()` filter's worth of items, not one row -- what `updateItemsPlace`
// below chunks over so a place shared by thousands of items becomes a
// handful of requests instead of one per row (#PERF-H6).
export function rawUpdateItemsPlace(
  ids: string[],
  payload: Pick<ItemUpdate, 'place_lat' | 'place_lng'>,
) {
  return supabase.from('items').update(payload).in('id', ids);
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

// Narrowed by the same search as the list (via likePatternFor, the same
// gate and escaping as searchFilterFor), so the map is the same set of
// entries seen from above. Grouped by place in Postgres itself
// (list_category_places, 0014_list_category_places.sql) rather than
// downloaded one row per item and folded on the client (#PERF-H5) -- the
// wire now carries one row per distinct place, bounded by PostgREST's own
// max_rows the way every other unranged read in this app already is,
// rather than one row per item in the category. `security invoker`, so
// this changes nothing about who may see what: the function runs under
// the caller's own RLS, exactly as if items/item_categories were queried
// directly.
export function rawListCategoryPlaces(
  categoryId: string,
  search: string,
  signal?: AbortSignal,
) {
  const query = supabase.rpc(
    'list_category_places',
    { cat_id: categoryId, like_pattern: likePatternFor(search) ?? undefined },
    { get: true },
  );
  return withSignal(query, signal).overrideTypes<
    PlaceGroupRow[],
    { merge: false }
  >();
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
    .order('created_at')
    .order('id')
    .range(from, to)
    .overrideTypes<ExportItemRow[], { merge: false }>();
}

export type ExportItemRow = ItemFields & { created_at: string };

/**
 * The map's places for a category: a thin await over `rawListCategoryPlaces`
 * -- kept outside the ignored block above so it has a plain, mockable
 * return type instead of the raw postgrest builder's, the same reasoning
 * `listItems` is kept alongside `rawListItems`. `rawList` is a parameter
 * for exactly that test, not for production callers.
 */
export async function listCategoryPlaces(
  categoryId: string,
  search: string,
  signal?: AbortSignal,
  rawList: typeof rawListCategoryPlaces = rawListCategoryPlaces,
): Promise<{ data: PlaceGroupRow[] | null; error: unknown }> {
  const { data, error } = await rawList(categoryId, search, signal);
  return { data: data ?? null, error };
}

// Ids per `.in()` filter; more risks hitting a URL length limit before
// PostgREST's own row cap does (same constant, and same reasoning, as
// data/categories.ts and data/images.ts).
const ID_FILTER_CHUNK_SIZE = 100;

/**
 * Writes a geocoded place back onto every item at that place, one request
 * per `ID_FILTER_CHUNK_SIZE` items rather than one per item (#PERF-H6) --
 * `Map/usePlaces.tsx` calls this once per resolved place, not once per row.
 * `updatePage` is a parameter so the chunking can be driven with a fake
 * instead of a real database.
 */
export async function updateItemsPlace(
  ids: string[],
  payload: Pick<ItemUpdate, 'place_lat' | 'place_lng'>,
  updatePage: typeof rawUpdateItemsPlace = rawUpdateItemsPlace,
): Promise<{ error: unknown }> {
  for (const page of chunk(ids, ID_FILTER_CHUNK_SIZE)) {
    const { error } = await updatePage(page, payload);
    if (error) return { error };
  }
  return { error: null };
}

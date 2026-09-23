import { chunk } from '../lib/chunk';
import { supabase } from '../supabase';
import type { Database } from './database.types';
import type { ImageListRow } from './images';
import { likePatternFor, searchFilterFor } from './itemSearch';

type ItemRow = Database['public']['Tables']['items']['Row'];
export type ItemInsert = Database['public']['Tables']['items']['Insert'];
export type ItemUpdate = Database['public']['Tables']['items']['Update'];

// One list for the type and the `.select()` string: `.overrideTypes()` asserts, it never checks.
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
/** One `item_categories` row of a page read, before `listItems` flattens it. */
type ItemCategoryPageRow = { items: ItemFields & { images: ImageListRow[] } };

/** One distinct place in a category; `ids` is every item there without finite coordinates. */
export interface PlaceGroupRow {
  place: string;
  place_lat: number | null;
  place_lng: number | null;
  titles: string[];
  ids: string[];
}

export const ITEM_FIELDS_SELECT = ITEM_FIELD_KEYS.join(',');
// item_categories drives the read so .order()/.range() walk idx_item_categories_cat_created.
const ITEM_CATEGORY_PAGE_SELECT = `items!inner(${ITEM_FIELDS_SELECT})`;
const ITEM_CATEGORY_PAGE_WITH_IMAGES_SELECT = `items!inner(${ITEM_FIELDS_SELECT},images(id,item_id,path_full,path_thumb))`;

/** `abortSignal` only stores what it is given, so an absent signal needs no branch at call sites. */
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
  /** Aborts a request superseded by a newer one. */
  signal?: AbortSignal;
}) {
  // No `count: 'exact'` here: the total comes from the cheaper rawCountItems request.
  let query = supabase
    .from('item_categories')
    .select(ITEM_CATEGORY_PAGE_WITH_IMAGES_SELECT)
    .eq('category_id', categoryId);

  const filter = searchFilterFor(search);
  if (filter) query = query.or(filter, { referencedTable: 'items' });

  return (
    withSignal(query, signal)
      .order('created_at', { ascending: false })
      // The item id breaks ties, so entries linked in one statement page stably.
      .order('item_id', { ascending: true })
      // Photographs oldest-first per item, as listImagesForItems orders them.
      .order('created_at', { referencedTable: 'items.images', ascending: true })
      .order('id', { referencedTable: 'items.images', ascending: true })
      .range(from, to)
      .overrideTypes<ItemCategoryPageRow[], { merge: false }>()
  );
}

/** The exact total; the items join is ~15x dearer and only a search filter needs it back. */
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

/** The searched page and its total in one `search_category_items` call, an RLS-bypassing ILIKE. */
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

/** Just the item's own fields, dropping whatever a read carried alongside. */
function itemFieldsOf({
  id,
  title,
  description,
  place,
  place_lat,
  place_lng,
  tags,
}: ItemFields): ItemFields {
  return { id, title, description, place, place_lat, place_lng, tags };
}

type ListItemsCalls = {
  rawList?: typeof rawListItems;
  rawCount?: typeof rawCountItems;
  rawSearch?: typeof rawSearchCategoryItems;
};

/** The catalogue page, newest first; `imageRows` is null on the searched path, which has none. */
export async function listItems(
  params: {
    categoryId: string;
    search: string;
    from: number;
    to: number;
    signal?: AbortSignal;
  },
  {
    rawList = rawListItems,
    rawCount = rawCountItems,
    rawSearch = rawSearchCategoryItems,
  }: ListItemsCalls = {},
): Promise<{
  data: ItemFields[] | null;
  error: unknown;
  count: number | null;
  imageRows: ImageListRow[] | null;
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
    if (error) return { data: null, error, count: null, imageRows: null };
    const rows = data ?? [];
    const count = rows.length > 0 ? rows[0].total_count : 0;
    return {
      data: rows.map(itemFieldsOf),
      error: null,
      count,
      imageRows: null,
    };
  }

  const [{ data, error }, { count, error: countError }] = await Promise.all([
    rawList(params),
    rawCount(params),
  ]);
  if (error) return { data: null, error, count: null, imageRows: null };
  if (countError) {
    return { data: null, error: countError, count: null, imageRows: null };
  }
  const rows = data ?? [];
  return {
    data: rows.map((row) => itemFieldsOf(row.items)),
    error: null,
    count,
    imageRows: rows.flatMap((row) => row.items.images),
  };
}

export function createItem(payload: Pick<ItemInsert, ItemEditableFieldKey>) {
  return (
    supabase
      .from('items')
      // user_id is never sent: enforce_user_id() fills it from the JWT, so no row changes hands.
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

/** One `.in()` filter's worth of items, what `updateItemsPlace` chunks over. */
export function rawUpdateItemsPlace(
  ids: string[],
  payload: Pick<ItemUpdate, 'place_lat' | 'place_lng'>,
) {
  return supabase.from('items').update(payload).in('id', ids);
}

// `.select().single()` turns an RLS-refused delete (zero rows, `{ error: null }`) into an error.
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
    // tg_item_categories_enforce() derives user_id from the linked rows, never from the client.
  } as Database['public']['Tables']['item_categories']['Insert']);
}

/** A row an import writes in bulk: its id and timestamp are chosen by the caller. */
export type ImportedItemInsert = Pick<ItemInsert, ItemEditableFieldKey> & {
  id: string;
  created_at: string;
};

// user_id is filled in by enforce_user_id(), exactly as for createItem.
export function createItems(rows: ImportedItemInsert[]) {
  return supabase.from('items').insert(rows as ItemInsert[]);
}

// tg_item_categories_enforce() derives and rechecks user_id per row.
export function linkItemsToCategory(
  links: { item_id: string; category_id: string; created_at: string }[],
) {
  return supabase
    .from('item_categories')
    .insert(
      links as Database['public']['Tables']['item_categories']['Insert'][],
    );
}

export function deleteItems(ids: string[]) {
  return supabase.from('items').delete().in('id', ids);
}

/** Places grouped in Postgres (`list_category_places`, security invoker) under the list's search gate. */
export function rawListCategoryPlaces({
  categoryId,
  search,
  signal,
}: {
  categoryId: string;
  search: string;
  signal?: AbortSignal;
}) {
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

/** A plain, mockable await over `rawListCategoryPlaces`; `rawList` exists for its test. */
export async function listCategoryPlaces(
  {
    categoryId,
    search,
    signal,
  }: { categoryId: string; search: string; signal?: AbortSignal },
  rawList: typeof rawListCategoryPlaces = rawListCategoryPlaces,
): Promise<{ data: PlaceGroupRow[] | null; error: unknown }> {
  const { data, error } = await rawList({ categoryId, search, signal });
  return { data: data ?? null, error };
}

// Ids per `.in()` filter; more risks a URL length limit before PostgREST's row cap.
const ID_FILTER_CHUNK_SIZE = 100;

/** Writes a geocoded place onto every item at it, one request per chunk; `updatePage` is for the test. */
export async function updateItemsPlace(
  {
    ids,
    payload,
  }: { ids: string[]; payload: Pick<ItemUpdate, 'place_lat' | 'place_lng'> },
  updatePage: typeof rawUpdateItemsPlace = rawUpdateItemsPlace,
): Promise<{ error: unknown }> {
  for (const page of chunk(ids, ID_FILTER_CHUNK_SIZE)) {
    const { error } = await updatePage(page, payload);
    if (error) return { error };
  }
  return { error: null };
}

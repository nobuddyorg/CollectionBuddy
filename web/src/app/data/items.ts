import { chunk } from '../lib/chunk';
import { readAllPages } from '../lib/pages';
import { supabase } from '../supabase';
import type { Database } from './database.types';
import { likePatternFor } from './itemSearch';

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

/** One distinct place in a category; `ids` is every item there without finite coordinates. */
export interface PlaceGroupRow {
  place: string;
  place_lat: number | null;
  place_lng: number | null;
  titles: string[];
  ids: string[];
}

export const ITEM_FIELDS_SELECT = ITEM_FIELD_KEYS.join(',');

/** `abortSignal` only stores what it is given, so an absent signal needs no branch at call sites. */
export function withSignal<T extends { abortSignal(signal: AbortSignal): T }>(
  query: T,
  signal: AbortSignal | undefined,
): T {
  return query.abortSignal(signal as AbortSignal);
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

// PostgREST caps an unranged request at max_rows (supabase/config.toml) and truncates silently.
const PLACE_PAGE_SIZE = 1000;

/** One page of places grouped in Postgres (`list_category_places`, security invoker, ordered by place) under the list's search gate. */
export function rawListCategoryPlaces({
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
  signal?: AbortSignal;
}) {
  const query = supabase
    .rpc(
      'list_category_places',
      { cat_id: categoryId, like_pattern: likePatternFor(search) ?? undefined },
      { get: true },
    )
    .range(from, to);
  return withSignal(query, signal).overrideTypes<
    PlaceGroupRow[],
    { merge: false }
  >();
}

/** Every place in the category, paged past the row cap; `rawList` exists for its test. */
export async function listCategoryPlaces(
  {
    categoryId,
    search,
    signal,
  }: { categoryId: string; search: string; signal?: AbortSignal },
  rawList: typeof rawListCategoryPlaces = rawListCategoryPlaces,
): Promise<{ data: PlaceGroupRow[] | null; error: unknown }> {
  return readAllPages<PlaceGroupRow>(PLACE_PAGE_SIZE, (from, to) =>
    rawList({ categoryId, search, from, to, signal }),
  );
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

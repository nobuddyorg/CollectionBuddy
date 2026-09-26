import { supabase } from '../supabase';
import type { ImageListRow } from './images';
import { ITEM_FIELDS_SELECT, withSignal, type ItemFields } from './items';
import { likePatternFor, searchFilterFor } from './itemSearch';

/** One entry of a page read, with its photographs, before `listItems` splits them. */
type ItemWithImages = ItemFields & { images: ImageListRow[] };

const ITEM_CATEGORY_PAGE_SELECT = `items!inner(${ITEM_FIELDS_SELECT})`;
const ITEM_WITH_IMAGES_SELECT = `${ITEM_FIELDS_SELECT},images(id,item_id,path_full,path_thumb)`;

/** The page's item ids, newest first, walking idx_item_categories_cat_created. */
export function rawListItemIds({
  categoryId,
  from,
  to,
  signal,
}: {
  categoryId: string;
  from: number;
  to: number;
  /** Aborts a request superseded by a newer one. */
  signal?: AbortSignal;
}) {
  // No embed: PostgREST builds one for every row an offset skips, so a deep page would cost O(offset).
  const query = supabase
    .from('item_categories')
    .select('item_id')
    .eq('category_id', categoryId);
  return (
    withSignal(query, signal)
      .order('created_at', { ascending: false })
      // The item id breaks ties, so entries linked in one statement page stably.
      .order('item_id')
      .range(from, to)
  );
}

/** The page's entries by id through items_pkey, each with its photographs via idx_images_item_created_at. */
export function rawListItemsByIds({
  ids,
  signal,
}: {
  ids: string[];
  signal?: AbortSignal;
}) {
  const query = supabase
    .from('items')
    .select(ITEM_WITH_IMAGES_SELECT)
    .in('id', ids);
  return (
    withSignal(query, signal)
      // Photographs oldest-first per item, as listImagesForItems orders them.
      .order('created_at', { referencedTable: 'images', ascending: true })
      .order('id', { referencedTable: 'images', ascending: true })
      .overrideTypes<ItemWithImages[], { merge: false }>()
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

/** The rows in `ids` order; an id whose entry was deleted between the two reads drops out. */
function inIdOrder<T extends { id: string }>(
  ids: string[],
  rows: T[] | null,
): T[] {
  const byId = new Map(rows?.map((row) => [row.id, row] as const));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

type ListItemsCalls = {
  rawIds?: typeof rawListItemIds;
  rawItems?: typeof rawListItemsByIds;
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
    rawIds = rawListItemIds,
    rawItems = rawListItemsByIds,
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

  const [{ data: links, error }, { count, error: countError }] =
    await Promise.all([rawIds(params), rawCount(params)]);
  if (error) return { data: null, error, count: null, imageRows: null };
  if (countError) {
    return { data: null, error: countError, count: null, imageRows: null };
  }
  const ids = (links ?? []).map((link) => link.item_id);
  if (ids.length === 0) return { data: [], error: null, count, imageRows: [] };

  const { data: rows, error: itemsError } = await rawItems({
    ids,
    signal: params.signal,
  });
  if (itemsError) {
    return { data: null, error: itemsError, count: null, imageRows: null };
  }
  const page = inIdOrder(ids, rows);
  return {
    data: page.map(itemFieldsOf),
    error: null,
    count,
    imageRows: page.flatMap((row) => row.images),
  };
}

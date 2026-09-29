import type { ReadResult } from '../lib/pages';
import { supabase } from '../supabase';
import type { ExportImageRow } from './images';
import { ITEM_FIELDS_SELECT, type ItemFields } from './items';
import { afterKeyset } from './keyset';

export type ExportItemRow = ItemFields & { created_at: string };

/** Where the next export page starts: the last page's final link row. */
export type ExportCursor = { linkedAt: string; itemId: string };

export type ExportPageRequest = {
  categoryId: string;
  after: ExportCursor | null;
  size: number;
};

type ExportLinkRow = {
  created_at: string;
  item_id: string;
  items: ExportItemRow & { images: ExportImageRow[] };
};

// Full size only: an export never wants thumbnails, and `size_bytes` sums to its size estimate.
const EXPORT_ITEM_SELECT = `created_at,item_id,items!inner(${ITEM_FIELDS_SELECT},created_at,images(item_id,path_full,size_bytes))`;

// Keyset-paged from item_categories, oldest-first, walking idx_item_categories_cat_created; photos ride along per item.
export function rawListItemsForExport({
  categoryId,
  after,
  size,
}: ExportPageRequest) {
  let query = supabase
    .from('item_categories')
    .select(EXPORT_ITEM_SELECT)
    .eq('category_id', categoryId);
  if (after) {
    query = afterKeyset(query, {
      first: { column: 'created_at', value: after.linkedAt },
      second: { column: 'item_id', value: after.itemId },
    });
  }
  return (
    query
      .order('created_at')
      .order('item_id')
      // Photographs oldest-first per item, the order the app shows them in, the cover first.
      .order('created_at', { referencedTable: 'items.images', ascending: true })
      .order('id', { referencedTable: 'items.images', ascending: true })
      .limit(size)
      .overrideTypes<ExportLinkRow[], { merge: false }>()
  );
}

type ExportPage = {
  items: ExportItemRow[];
  photos: ExportImageRow[];
  next: ExportCursor | null;
};

/** One page flattened to its items and their photographs plus the next cursor, or none once a page comes back short. */
export async function listItemsForExport(
  page: ExportPageRequest,
  rawList: typeof rawListItemsForExport = rawListItemsForExport,
): Promise<ReadResult<ExportPage>> {
  const { data, error } = await rawList(page);
  if (error) return { data: null, error };
  const last = data.at(-1);
  const next =
    last && data.length === page.size
      ? { linkedAt: last.created_at, itemId: last.item_id }
      : null;
  const items: ExportItemRow[] = [];
  const photos: ExportImageRow[] = [];
  // Split off, since the manifest spreads an item whole and must not carry its storage paths.
  for (const {
    items: { images, ...item },
  } of data) {
    items.push(item);
    photos.push(...images);
  }
  return { data: { items, photos, next }, error: null };
}

import { supabase } from '../supabase';
import { ITEM_FIELDS_SELECT, type ItemFields } from './items';

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
  items: ExportItemRow;
};

// Quoted although both values come from the database: a timestamp carries `.` and `:`.
export function exportCursorFilter(cursor: ExportCursor): string {
  const linkedAt = `"${cursor.linkedAt}"`;
  return `created_at.gt.${linkedAt},and(created_at.eq.${linkedAt},item_id.gt."${cursor.itemId}")`;
}

// Keyset-paged from item_categories, oldest-first, walking idx_item_categories_cat_created.
export function rawListItemsForExport({
  categoryId,
  after,
  size,
}: ExportPageRequest) {
  let query = supabase
    .from('item_categories')
    .select(`created_at,item_id,items!inner(${ITEM_FIELDS_SELECT},created_at)`)
    .eq('category_id', categoryId);
  if (after) {
    // The gte lets the index scan start at the cursor; the or=() drops the ties already read.
    query = query
      .gte('created_at', after.linkedAt)
      .or(exportCursorFilter(after));
  }
  return query
    .order('created_at')
    .order('item_id')
    .limit(size)
    .overrideTypes<ExportLinkRow[], { merge: false }>();
}

/** One page flattened to its items plus the next cursor, or none once a page comes back short. */
export async function listItemsForExport(
  page: ExportPageRequest,
  rawList: typeof rawListItemsForExport = rawListItemsForExport,
): Promise<
  | { data: { items: ExportItemRow[]; next: ExportCursor | null }; error: null }
  | { data: null; error: NonNullable<unknown> }
> {
  const { data, error } = await rawList(page);
  if (error) return { data: null, error };
  const rows = data ?? [];
  const last = rows.at(-1);
  const next =
    last && rows.length === page.size
      ? { linkedAt: last.created_at, itemId: last.item_id }
      : null;
  return { data: { items: rows.map((row) => row.items), next }, error: null };
}

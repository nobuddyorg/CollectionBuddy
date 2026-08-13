import { supabase } from '../supabase';
import type { Database } from './database.types';

export const ITEM_IMAGES_BUCKET = 'item-images';

// The single definition of how a storage prefix is built from a user and an
// item -- callers construct paths through this rather than the template
// literal by hand, so changing the scheme is a one-line edit instead of a
// grep across the app.
export function imagePrefix(uid: string, itemId: string): string {
  return `${uid}/${itemId}`;
}

export function createSignedUrls(paths: string[], expiresInSeconds = 3600) {
  return supabase.storage
    .from(ITEM_IMAGES_BUCKET)
    .createSignedUrls(paths, expiresInSeconds);
}

export function uploadImageObject(path: string, file: Blob) {
  return supabase.storage.from(ITEM_IMAGES_BUCKET).upload(path, file);
}

export function removeImageObjects(paths: string[]) {
  return supabase.storage.from(ITEM_IMAGES_BUCKET).remove(paths);
}

export type ImageRow = Database['public']['Tables']['images']['Row'];

// What the grid/export read path needs per photograph. `id` is the row's
// own primary key -- carried through to ImgEntry so a single photograph can
// be deleted by id instead of the old filename-derived pairing key.
export type ImageListRow = Pick<
  ImageRow,
  'id' | 'item_id' | 'path_full' | 'path_thumb'
>;

// What a capture-before-cascade read needs -- see removeItem
// (useItemMutations.tsx) and deleteCategory (useCategories.tsx). No `id`:
// both callers act on a whole item's photographs via the item's own id
// (the images rows are about to be cascade-deleted along with it), never on
// one photograph by its own id.
export type ImagePathRow = Pick<ImageRow, 'item_id' | 'path_full' | 'path_thumb'>;

// What exportCategory.ts needs: the full-size path an export writes to the
// archive, and its byte size (LARGE_EXPORT_WARN_BYTES warns before a large
// download starts). No `path_thumb`: an export's manifest is only ever
// built from full-size paths (exportEntries, exportFormat.ts), so there is
// nothing to filter out of this afterward the way fullSizeObjectPaths used
// to filter thumbnails out of a Storage listing.
export type ExportImageRow = Pick<ImageRow, 'item_id' | 'path_full' | 'size_bytes'>;

// Written once both Storage uploads have landed -- see uploadImage in
// useItemImages.tsx. user_id is never sent: tg_images_enforce
// (0013_images.sql) derives it from the item's own owner and rejects
// anything else, the same pattern createCategory/linkItemToCategory already
// rely on for their own owner-derived columns.
export function createImageRow(row: {
  item_id: string;
  path_full: string;
  path_thumb: string | null;
  size_bytes: number;
}) {
  return supabase
    .from('images')
    .insert(row as Database['public']['Tables']['images']['Insert'])
    .select('id, item_id, path_full, path_thumb')
    .single<ImageListRow>();
}

// The direct-target delete: the row IS what's being removed, not a side
// effect of some other row's cascade, so delete-and-capture in one call is
// safe here (contrast removeItem/deleteCategory below, which must read
// *before* a delete that would cascade the images rows away).
export function deleteImageRow(id: string) {
  return supabase
    .from('images')
    .delete()
    .eq('id', id)
    .select('path_full, path_thumb')
    .single<Pick<ImageRow, 'path_full' | 'path_thumb'>>();
}

// PostgREST caps an unranged request at max_rows (supabase/config.toml,
// 1000) and truncates silently -- paged the same way listItemIdsForCategory
// (data/categories.ts) is, for the same reason (#409): an unpaginated
// listing above the cap would come back short with no error to say so.
const ROW_PAGE_SIZE = 1000;

// How many ids ride in one `.in()` filter's query string. Same precedent as
// categories.ts's ID_FILTER_CHUNK_SIZE / exportCategory.ts's SIGN_BATCH_SIZE:
// a few thousand UUIDs would hit a URL length limit long before the row cap
// did.
const ID_FILTER_CHUNK_SIZE = 100;

// Chunks an id list (URL-length concern) and pages each chunk (row-cap
// concern), the same double loop as categories.ts's
// listItemIdsLinkedElsewhere, generalized over which columns the caller
// wants -- every reader of this table (the grid, export, the two
// capture-before-cascade delete paths) shares this shape and differs only
// in `select`.
async function selectImagesForItems<T>(
  itemIds: string[],
  select: string,
): Promise<{ data: T[] | null; error: unknown }> {
  const rows: T[] = [];
  for (let i = 0; i < itemIds.length; i += ID_FILTER_CHUNK_SIZE) {
    const chunk = itemIds.slice(i, i + ID_FILTER_CHUNK_SIZE);
    for (let page = 0; ; page++) {
      const from = page * ROW_PAGE_SIZE;
      const { data, error } = await supabase
        .from('images')
        .select(select)
        .in('item_id', chunk)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + ROW_PAGE_SIZE - 1)
        .returns<T[]>();
      if (error) return { data: null, error };
      if (!data?.length) break;
      rows.push(...data);
      if (data.length < ROW_PAGE_SIZE) break;
    }
  }
  return { data: rows, error: null };
}

// One query for every item asked about, replacing what used to be one
// storage.list() call per item -- the whole reason this table exists.
// Ordered oldest-first, `id` breaking a tie between two photographs
// uploaded in the same instant, matching IMAGE_LIST_SORT's old ordering
// guarantee (#265) and idx_images_item_created_at (0013_images.sql).
export function listImagesForItems(
  itemIds: string[],
): Promise<{ data: ImageListRow[] | null; error: unknown }> {
  return selectImagesForItems<ImageListRow>(
    itemIds,
    'id, item_id, path_full, path_thumb',
  );
}

// Read-only: captures a set of items' photograph paths before a delete that
// will cascade their images rows away (a direct item delete, or an
// orphaned-item cleanup during a category delete), so the Storage bytes can
// still be removed once the row-delete this is guarding has gone through.
// See 0013_images.sql's note on the FK-cascade-timing design for why this
// has to run before, not after, that delete.
export function listImagePathsForItems(
  itemIds: string[],
): Promise<{ data: ImagePathRow[] | null; error: unknown }> {
  return selectImagesForItems<ImagePathRow>(
    itemIds,
    'item_id, path_full, path_thumb',
  );
}

// export's photo listing -- see exportCategory.ts's fetchPhotoPaths. Never
// selects path_thumb; an export never wants thumbnails.
export function listExportImagesForItems(
  itemIds: string[],
): Promise<{ data: ExportImageRow[] | null; error: unknown }> {
  return selectImagesForItems<ExportImageRow>(
    itemIds,
    'item_id, path_full, size_bytes',
  );
}

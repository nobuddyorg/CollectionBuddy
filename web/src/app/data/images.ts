import { supabase } from '../supabase';
import type { Database } from './database.types';

export const ITEM_IMAGES_BUCKET = 'item-images';

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

// `id` is the row's own primary key, carried through so a single photograph
// can be deleted by id.
export type ImageListRow = Pick<
  ImageRow,
  'id' | 'item_id' | 'path_full' | 'path_thumb'
>;

// No `id`: capture-before-cascade readers (removeItem, deleteCategory) act
// on a whole item's photographs via the item's own id, never one photo's.
export type ImagePathRow = Pick<
  ImageRow,
  'item_id' | 'path_full' | 'path_thumb'
>;

// No `path_thumb`: an export's manifest is only ever built from full-size
// paths.
export type ExportImageRow = Pick<
  ImageRow,
  'item_id' | 'path_full' | 'size_bytes'
>;

// user_id is never sent: tg_images_enforce (0013_images.sql) derives it from
// the item's own owner and rejects anything else.
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

// The row IS what's being removed here, not a side effect of another row's
// cascade, so delete-and-capture in one call is safe (contrast the
// capture-before-cascade readers below).
export function deleteImageRow(id: string) {
  return supabase
    .from('images')
    .delete()
    .eq('id', id)
    .select('path_full, path_thumb')
    .single<Pick<ImageRow, 'path_full' | 'path_thumb'>>();
}

// PostgREST caps an unranged request at max_rows (supabase/config.toml,
// 1000) and truncates silently, so this pages instead of asking once.
const ROW_PAGE_SIZE = 1000;

// How many ids ride in one `.in()` filter's query string -- a few thousand
// UUIDs would hit a URL length limit long before the row cap did.
const ID_FILTER_CHUNK_SIZE = 100;

// Chunks an id list (URL-length concern) and pages each chunk (row-cap
// concern), generalized over which columns the caller wants.
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

// Ordered oldest-first, `id` breaking a tie between two photographs
// uploaded in the same instant, matching idx_images_item_created_at
// (0013_images.sql).
export function listImagesForItems(
  itemIds: string[],
): Promise<{ data: ImageListRow[] | null; error: unknown }> {
  return selectImagesForItems<ImageListRow>(
    itemIds,
    'id, item_id, path_full, path_thumb',
  );
}

// Read-only: captures photo paths before a delete that will cascade the
// images rows away, so the Storage bytes can still be removed afterward.
// Must run before that delete, not after (see 0013_images.sql).
export function listImagePathsForItems(
  itemIds: string[],
): Promise<{ data: ImagePathRow[] | null; error: unknown }> {
  return selectImagesForItems<ImagePathRow>(
    itemIds,
    'item_id, path_full, path_thumb',
  );
}

// Never selects path_thumb; an export never wants thumbnails.
export function listExportImagesForItems(
  itemIds: string[],
): Promise<{ data: ExportImageRow[] | null; error: unknown }> {
  return selectImagesForItems<ExportImageRow>(
    itemIds,
    'item_id, path_full, size_bytes',
  );
}

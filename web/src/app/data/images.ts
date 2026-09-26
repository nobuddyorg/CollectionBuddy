import { chunk } from '../lib/chunk';
import { readAllChunks, readAllPages } from '../lib/pages';
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

// Storage's sign route refuses more than 1,000 paths per request.
export const SIGN_URLS_BATCH_SIZE = 1000;

export function uploadImageObject(path: string, file: Blob) {
  return supabase.storage.from(ITEM_IMAGES_BUCKET).upload(path, file);
}

// Storage's bulk delete refuses more than 1,000 objects per request.
export const REMOVE_OBJECTS_BATCH_SIZE = 1000;

export function removeImageObjects(paths: string[]) {
  return supabase.storage.from(ITEM_IMAGES_BUCKET).remove(paths);
}

export type ImageRow = Database['public']['Tables']['images']['Row'];

/** Carries the row's own `id`, so a single photograph can be deleted by it. */
export type ImageListRow = Pick<
  ImageRow,
  'id' | 'item_id' | 'path_full' | 'path_thumb'
>;

/** No `id`: capture-before-cascade readers act on a whole item's photographs, never one photo. */
export type ImagePathRow = Pick<
  ImageRow,
  'item_id' | 'path_full' | 'path_thumb'
>;

/** No `path_thumb`: an export's manifest is only ever built from full-size paths. */
export type ExportImageRow = Pick<
  ImageRow,
  'item_id' | 'path_full' | 'size_bytes'
>;

type NewImageRow = {
  item_id: string;
  path_full: string;
  path_thumb: string | null;
  size_bytes: number;
};

/** An import stamps `created_at` in archive order; an upload leaves it to the column default. */
type ImportedImageRow = NewImageRow & { created_at: string };

// user_id is never sent: tg_images_enforce derives it from the item's owner and rejects the rest.
export function createImageRow(row: NewImageRow | ImportedImageRow) {
  return supabase
    .from('images')
    .insert(row as Database['public']['Tables']['images']['Insert'])
    .select('id, item_id, path_full, path_thumb')
    .single<ImageListRow>();
}

// `.single()` makes a delete that matched no row, hidden by RLS or already gone, an error.
export function deleteImageRow(id: string) {
  return supabase
    .from('images')
    .delete()
    .eq('id', id)
    .select('id')
    .single<Pick<ImageRow, 'id'>>();
}

// PostgREST caps an unranged request at max_rows (supabase/config.toml) and truncates silently.
const ROW_PAGE_SIZE = 1000;

// Ids per `.in()` filter; a few thousand UUIDs would hit a URL length limit before the row cap.
const ID_FILTER_CHUNK_SIZE = 100;

// Chunks the id list (URL length), pages each chunk (row cap), and reads a few chunks at once.
function selectImagesForItems<T>(
  itemIds: string[],
  select: string,
): Promise<
  { data: T[]; error: null } | { data: null; error: NonNullable<unknown> }
> {
  return readAllChunks(chunk(itemIds, ID_FILTER_CHUNK_SIZE), (ids) =>
    readAllPages<T>(ROW_PAGE_SIZE, (from, to) =>
      supabase
        .from('images')
        .select(select)
        .in('item_id', ids)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
        .overrideTypes<T[], { merge: false }>(),
    ),
  );
}

// Oldest-first, `id` breaking a same-instant tie, matching idx_images_item_created_at.
export function listImagesForItems(
  itemIds: string[],
): Promise<
  | { data: ImageListRow[]; error: null }
  | { data: null; error: NonNullable<unknown> }
> {
  return selectImagesForItems<ImageListRow>(
    itemIds,
    'id, item_id, path_full, path_thumb',
  );
}

// Captures photo paths before a delete cascades the rows away; runs before that delete, never after.
export function listImagePathsForItems(
  itemIds: string[],
): Promise<
  | { data: ImagePathRow[]; error: null }
  | { data: null; error: NonNullable<unknown> }
> {
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

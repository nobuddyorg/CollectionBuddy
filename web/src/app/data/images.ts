import { isRetryableStatus } from '../lib/backoff';
import { chunk } from '../lib/chunk';
import { readAllChunks, readAllKeysetPages } from '../lib/pages';
import { supabase } from '../supabase';
import type { Database } from './database.types';
import { rowsAfterFilter } from './keyset';

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

/** Only no response, a 429 or a 5xx can pass on a retry; Storage sends its own code as `statusCode`, often under an HTTP 400. */
export function isTransientStorageError({
  status,
  statusCode,
}: {
  status?: number;
  statusCode?: string;
}): boolean {
  if (status === undefined) return true;
  return [status, Number(statusCode)].some(isRetryableStatus);
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

type ImageKey = Pick<ImageRow, 'created_at' | 'id'>;

// Keyset-paged oldest-first, so a photograph deleted mid-walk shifts none past a page; the key rides along on every row.
function rawSelectImagesPage<T>({
  itemIds,
  select,
  after,
}: {
  itemIds: string[];
  select: string;
  after: (T & ImageKey) | null;
}) {
  let query = supabase
    .from('images')
    .select(`${select}, created_at, id`)
    .in('item_id', itemIds);
  if (after) {
    query = query
      .gte('created_at', after.created_at)
      .or(
        rowsAfterFilter(
          { column: 'created_at', value: after.created_at },
          { column: 'id', value: after.id },
        ),
      );
  }
  return query
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(ROW_PAGE_SIZE)
    .overrideTypes<(T & ImageKey)[], { merge: false }>();
}

// Chunks the id list (URL length), pages each chunk (row cap), and reads a few chunks at once.
function selectImagesForItems<T>(
  itemIds: string[],
  select: string,
): Promise<
  { data: T[]; error: null } | { data: null; error: NonNullable<unknown> }
> {
  return readAllChunks(chunk(itemIds, ID_FILTER_CHUNK_SIZE), (ids) =>
    readAllKeysetPages<T & ImageKey>(ROW_PAGE_SIZE, (after) =>
      rawSelectImagesPage<T>({ itemIds: ids, select, after }),
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
  // `id` arrives with the sort key.
  return selectImagesForItems<ImageListRow>(
    itemIds,
    'item_id, path_full, path_thumb',
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

type CategoryImagePathRow = ImagePathRow & Pick<ImageRow, 'id'>;

// Keyset-paged down images_pkey, each row kept via items_pkey and item_categories_pkey; the empty embeds only filter.
function rawListImagePathsForCategory({
  categoryId,
  after,
}: {
  categoryId: string;
  after: CategoryImagePathRow | null;
}) {
  let query = supabase
    .from('images')
    .select(
      'id, item_id, path_full, path_thumb, items!inner(item_categories!inner())',
    )
    .eq('items.item_categories.category_id', categoryId);
  if (after) query = query.gt('id', after.id);
  return query
    .order('id')
    .limit(ROW_PAGE_SIZE)
    .overrideTypes<CategoryImagePathRow[], { merge: false }>();
}

/** Every photograph of every entry filed in the category, walked a page at a time; runs before the category delete, never after. */
export function listImagePathsForCategory(
  categoryId: string,
): Promise<
  | { data: CategoryImagePathRow[]; error: null }
  | { data: null; error: NonNullable<unknown> }
> {
  return readAllKeysetPages<CategoryImagePathRow>(ROW_PAGE_SIZE, (after) =>
    rawListImagePathsForCategory({ categoryId, after }),
  );
}

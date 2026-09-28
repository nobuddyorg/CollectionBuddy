import { isRetryableStatus } from '../lib/backoff';
import { chunk } from '../lib/chunk';
import {
  readAllChunks,
  readAllKeysetPages,
  type ReadResult,
} from '../lib/pages';
import { supabase } from '../supabase';
import type { Database } from './database.types';
import { afterKeyset } from './keyset';
import { ID_FILTER_CHUNK_SIZE, POSTGREST_MAX_ROWS } from './postgrestLimits';

export const ITEM_IMAGES_BUCKET = 'item-images';

export function imagePrefix(userId: string, itemId: string): string {
  return `${userId}/${itemId}`;
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

type ImageRow = Database['public']['Tables']['images']['Row'];

const IMAGE_LIST_KEYS = ['id', 'item_id', 'path_full', 'path_thumb'] as const;
/** Carries the row's own `id`, so a single photograph can be deleted by it. */
export type ImageListRow = Pick<ImageRow, (typeof IMAGE_LIST_KEYS)[number]>;
export const IMAGE_LIST_SELECT = IMAGE_LIST_KEYS.join(', ');

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
    .select(IMAGE_LIST_SELECT)
    .single<ImageListRow>();
}

/** A delete that matched no row, hidden by RLS or already gone, fails, unless its entry is gone and its cascade took the row. */
export async function deleteImageRow({
  id,
  itemId,
}: {
  id: string;
  itemId: string;
}): Promise<{ error: Error | null }> {
  // No `.single()`: its 406 on no row is a console error in every browser, and a gone entry is no failure.
  const deleted = await supabase
    .from('images')
    .delete()
    .eq('id', id)
    .select('id');
  if (deleted.error !== null) return deleted;
  if (deleted.data.length > 0) return { error: null };
  const item = await supabase
    .from('items')
    .select('id')
    .eq('id', itemId)
    .maybeSingle();
  if (item.error !== null) return item;
  if (item.data === null) return { error: null };
  return { error: new Error(`Photograph ${id} was not deleted`) };
}

type ImagePageRow = ImageListRow & Pick<ImageRow, 'created_at'>;

// Keyset-paged oldest-first, so a photograph deleted mid-walk shifts none past a page; the key rides along on every row.
function rawSelectImagesPage({
  itemIds,
  after,
}: {
  itemIds: string[];
  after: ImagePageRow | null;
}) {
  let query = supabase
    .from('images')
    .select('item_id, path_full, path_thumb, created_at, id')
    .in('item_id', itemIds);
  if (after) {
    query = afterKeyset(query, {
      first: { column: 'created_at', value: after.created_at },
      second: { column: 'id', value: after.id },
    });
  }
  return query
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(POSTGREST_MAX_ROWS)
    .overrideTypes<ImagePageRow[], { merge: false }>();
}

// Oldest-first, `id` breaking a same-instant tie, matching idx_images_item_created_at.
export function listImagesForItems(
  itemIds: string[],
): Promise<ReadResult<ImageListRow[]>> {
  return readAllChunks(chunk(itemIds, ID_FILTER_CHUNK_SIZE), (ids) =>
    readAllKeysetPages<ImagePageRow>(POSTGREST_MAX_ROWS, (after) =>
      rawSelectImagesPage({ itemIds: ids, after }),
    ),
  );
}

// Keyset-paged down images_pkey, each row kept via items_pkey and item_categories_pkey; the empty embeds only filter.
function rawListImagePathsForCategory({
  categoryId,
  after,
}: {
  categoryId: string;
  after: ImageListRow | null;
}) {
  let query = supabase
    .from('images')
    .select(`${IMAGE_LIST_SELECT}, items!inner(item_categories!inner())`)
    .eq('items.item_categories.category_id', categoryId);
  if (after) query = query.gt('id', after.id);
  return query
    .order('id')
    .limit(POSTGREST_MAX_ROWS)
    .overrideTypes<ImageListRow[], { merge: false }>();
}

/** Every photograph of every entry filed in the category, walked a page at a time; runs before the category delete, never after. */
export function listImagePathsForCategory(
  categoryId: string,
): Promise<ReadResult<ImageListRow[]>> {
  return readAllKeysetPages<ImageListRow>(POSTGREST_MAX_ROWS, (after) =>
    rawListImagePathsForCategory({ categoryId, after }),
  );
}

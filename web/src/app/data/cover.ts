import { chunk } from '../lib/chunk';
import { readAllChunks, type ReadResult } from '../lib/pages';
import { supabase } from '../supabase';
import { ID_FILTER_CHUNK_SIZE } from './postgrestLimits';

/** An entry's chosen cover, or `null` where it has none and its oldest photo is the cover. */
export type ItemCover = { id: string; cover_image_id: string | null };

/** One entry's photos with its cover first, the rest in the order given; the same array where nothing moves. */
export function coverFirst<Photo extends { id: string }>(
  photos: Photo[],
  coverId: string | null,
): Photo[] {
  const index = photos.findIndex((photo) => photo.id === coverId);
  if (index <= 0) return photos;
  return [photos[index], ...photos.slice(0, index), ...photos.slice(index + 1)];
}

/** Every entry's photos in `rows`, each entry's cover moved before its first photo. */
export function coversFirst<Photo extends { id: string; item_id: string }>(
  rows: Photo[],
  covers: ItemCover[],
): Photo[] {
  const coverOf = new Map(covers.map((item) => [item.id, item.cover_image_id]));
  // Not Map.groupBy: Safari has it only from 17.4.
  const byItem = new Map<string, Photo[]>();
  for (const row of rows) {
    const photos = byItem.get(row.item_id);
    if (photos) photos.push(row);
    else byItem.set(row.item_id, [row]);
  }
  return [...byItem].flatMap(([itemId, photos]) =>
    coverFirst(photos, coverOf.get(itemId) ?? null),
  );
}

/** One `.in()` filter's worth of entries' covers, through items_pkey. */
export function rawReadItemCovers(ids: string[]) {
  return supabase
    .from('items')
    .select('id, cover_image_id')
    .in('id', ids)
    .overrideTypes<ItemCover[], { merge: false }>();
}

/** The covers of the entries in `itemIds`, a chunk per request; `rawRead` is for the test. */
export function readItemCovers(
  itemIds: string[],
  rawRead: typeof rawReadItemCovers = rawReadItemCovers,
): Promise<ReadResult<ItemCover[]>> {
  return readAllChunks(chunk(itemIds, ID_FILTER_CHUNK_SIZE), async (ids) => {
    const { data, error } = await rawRead(ids);
    return error ? { data: null, error } : { data, error: null };
  });
}

// `.select().single()` turns an RLS-refused update (zero rows, `{ error: null }`) into an error.
export function setItemCover({
  itemId,
  imageId,
}: {
  itemId: string;
  imageId: string;
}) {
  return supabase
    .from('items')
    .update({ cover_image_id: imageId })
    .eq('id', itemId)
    .select('id')
    .single<{ id: string }>();
}

/** Hands the cover on to the photo replacing it; an entry whose cover is another photo is left alone. */
export function moveItemCover({
  itemId,
  from,
  to,
}: {
  itemId: string;
  from: string;
  to: string;
}) {
  return supabase
    .from('items')
    .update({ cover_image_id: to })
    .eq('id', itemId)
    .eq('cover_image_id', from);
}

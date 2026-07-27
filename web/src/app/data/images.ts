import { supabase } from '../supabase';

export const ITEM_IMAGES_BUCKET = 'item-images';

export function listImageObjects(prefix: string, limit: number) {
  return supabase.storage.from(ITEM_IMAGES_BUCKET).list(prefix, {
    limit,
    sortBy: { column: 'created_at', order: 'desc' },
  });
}

// Pages through the full listing under a prefix so a `.webp`/`.thumb.webp`
// pair can never be split across a page boundary (each page is a multiple
// of one full page, not an arbitrary object cap).
export async function listAllImageObjects(prefix: string) {
  const pageSize = 100;
  const all: { name: string }[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase.storage
      .from(ITEM_IMAGES_BUCKET)
      .list(prefix, {
        limit: pageSize,
        offset,
        sortBy: { column: 'created_at', order: 'desc' },
      });
    if (error) return { data: null, error };
    if (!data?.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return { data: all, error: null };
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

// Deletes every stored object (full + thumb) under an item's prefix.
// Standalone (not part of a hook) so callers that don't otherwise need
// image state -- e.g. category deletion, which must clean up any items it
// is about to orphan -- can invoke it without mounting image state.
export async function removeItemImages(itemId: string): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return;

  const prefix = `${uid}/${itemId}`;
  const { data, error } = await listImageObjects(prefix, 100);
  if (error) throw error;
  if (!data?.length) return;

  const paths = data.map((o) => `${prefix}/${o.name}`);
  const { error: removeError } = await removeImageObjects(paths);
  if (removeError) throw removeError;
}

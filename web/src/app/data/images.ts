import { supabase } from '../supabase';

export const ITEM_IMAGES_BUCKET = 'item-images';

// Oldest photograph first, which is what puts a listing in the same order the
// grid lays its frames out in: the first shot of an item keeps the hero slot
// however many more are added, and a new one lands at the end -- exactly where
// its placeholder was already standing while it uploaded.
//
// Newest-first is what made an upload appear to jump (#265). The placeholder
// is appended, because that is where the picture is about to go; the listing
// then came back with that same picture at the *front*, so it displaced the
// hero and shifted every other photograph down one slot.
export const IMAGE_LIST_SORT = {
  column: 'created_at',
  order: 'asc',
} as const;

export function listImageObjects(prefix: string, limit: number) {
  return supabase.storage.from(ITEM_IMAGES_BUCKET).list(prefix, {
    limit,
    sortBy: IMAGE_LIST_SORT,
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
        sortBy: IMAGE_LIST_SORT,
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
//
// Returns the uid whose prefix was cleared, so a caller that needs it (to
// invalidate a cached listing, say) doesn't have to ask the auth client all
// over again for something this function has already looked up.
export async function removeItemImages(itemId: string): Promise<string | null> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return null;

  const prefix = `${uid}/${itemId}`;
  const { data, error } = await listImageObjects(prefix, 100);
  if (error) throw error;
  if (!data?.length) return uid;

  const paths = data.map((o) => `${prefix}/${o.name}`);
  const { error: removeError } = await removeImageObjects(paths);
  if (removeError) throw removeError;
  return uid;
}

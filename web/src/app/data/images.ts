import { supabase } from '../supabase';
import { currentUserId, verifiedUserId } from './auth';

export const ITEM_IMAGES_BUCKET = 'item-images';

// The single definition of how a storage prefix is built from a user and an
// item -- callers construct paths through this rather than the template
// literal by hand, so changing the scheme is a one-line edit instead of a
// grep across the app.
export function imagePrefix(uid: string, itemId: string): string {
  return `${uid}/${itemId}`;
}

// A thumbnail is a derivative this app generated for its own contact strip
// (see useItemImages), not a second photograph the user took -- the single
// definition of what marks an object as one, for the same reason as
// `imagePrefix` above: naming/pairing logic and the export path both need
// to agree on it, and previously each restated the suffix as its own
// string literal.
export const THUMB_SUFFIX = '.thumb.webp';
export function isThumbObject(name: string): boolean {
  return name.endsWith(THUMB_SUFFIX);
}

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

/** What a listed storage object carries that this app reads: its name, and
 * (when the backend returns it) the byte size an export sums up front to
 * warn before a large archive risks a killed tab rather than after (#428). */
export type ImageObject = {
  name: string;
  metadata: { size: number } | null;
};

// Pages through the full listing under a prefix so a `.webp`/`.thumb.webp`
// pair can never be split across a page boundary (each page is a multiple
// of one full page, not an arbitrary object cap).
export async function listAllImageObjects(prefix: string) {
  const pageSize = 100;
  const all: ImageObject[] = [];
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

// Resolves the current user and lists every stored object under their
// prefix for one item, in a single call -- the read-path counterpart of
// removeItemImages, for callers that would otherwise have to ask the auth
// client for the uid themselves just to build the same prefix by hand.
export async function listItemImages(itemId: string): Promise<{
  uid: string;
  prefix: string;
  data: ImageObject[] | null;
  error: unknown;
} | null> {
  const uid = await currentUserId();
  if (!uid) return null;
  const prefix = imagePrefix(uid, itemId);
  const { data, error } = await listAllImageObjects(prefix);
  return { uid, prefix, data, error };
}

// Deletes every stored object (full + thumb) under an item's prefix.
// Standalone (not part of a hook) so callers that don't otherwise need
// image state -- e.g. category deletion, which must clean up any items it
// is about to orphan -- can invoke it without mounting image state.
//
// Returns the uid whose prefix was cleared, so a caller that needs it (to
// invalidate a cached listing, say) doesn't have to ask the auth client all
// over again for something this function has already looked up.
//
// `knownUid` lets a caller that already resolved the uid skip asking again
// -- deleting a category calls this once per orphaned item, and without it
// every one of those was its own round trip to the auth server for an
// answer that couldn't have changed between them.
export async function removeItemImages(
  itemId: string,
  knownUid?: string | null,
): Promise<string | null> {
  const uid = knownUid !== undefined ? knownUid : await verifiedUserId();
  if (!uid) return null;

  const prefix = imagePrefix(uid, itemId);
  const { data, error } = await listAllImageObjects(prefix);
  if (error) throw error;
  if (!data?.length) return uid;

  const paths = data.map((o) => `${prefix}/${o.name}`);
  // Removed in the same page size as the listing, rather than one call for
  // however many hundreds of paths a large item has.
  const pageSize = 100;
  for (let i = 0; i < paths.length; i += pageSize) {
    const { error: removeError } = await removeImageObjects(
      paths.slice(i, i + pageSize),
    );
    if (removeError) throw removeError;
  }
  return uid;
}

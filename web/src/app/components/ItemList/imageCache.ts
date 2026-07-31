import type { ImageEntryData } from './useItemImages';

// Module-level so it outlives the components that read it. ItemList is
// keyed by category id, so switching category unmounts and remounts the
// whole tree -- anything held in hook state is thrown away and every
// listing and signature is fetched again.
//
// Re-signing is not just a round trip: a fresh signature is a different
// URL, so the browser cannot reuse the bytes it already downloaded either.
// Holding signatures steady is what lets the HTTP cache do its job.

type CachedUrl = { url: string; signedAt: number };
type CachedListing = { entries: Map<string, ImageEntryData>; listedAt: number };

const signedUrls = new Map<string, CachedUrl>();
const listings = new Map<string, CachedListing>();

// Supabase signs for an hour; stop trusting a signature before then so an
// image never resolves to an expired URL mid-render.
export const SIGNED_URL_TTL_MS = 3600_000;
export const SIGNED_URL_MARGIN_MS = 5 * 60_000;

// Listings only change through this app's own uploads and deletes, which
// invalidate explicitly. The short window covers the other device case
// without making a category switch re-list every time.
export const LISTING_TTL_MS = 60_000;

export function getCachedSignedUrl(
  path: string,
  now: number = Date.now(),
): string | undefined {
  const hit = signedUrls.get(path);
  if (!hit) return undefined;
  if (now - hit.signedAt >= SIGNED_URL_TTL_MS - SIGNED_URL_MARGIN_MS) {
    signedUrls.delete(path);
    return undefined;
  }
  return hit.url;
}

export function cacheSignedUrls(
  entries: Iterable<readonly [string, string]>,
  now: number = Date.now(),
): void {
  for (const [path, url] of entries) {
    signedUrls.set(path, { url, signedAt: now });
  }
}

/** Paths with no usable signature yet -- the only ones worth a round trip. */
export function unsignedPaths(
  paths: string[],
  now: number = Date.now(),
): string[] {
  const missing = new Set<string>();
  for (const path of paths) {
    if (!getCachedSignedUrl(path, now)) missing.add(path);
  }
  return Array.from(missing);
}

export function getCachedListing(
  prefix: string,
  now: number = Date.now(),
): Map<string, ImageEntryData> | undefined {
  const hit = listings.get(prefix);
  if (!hit) return undefined;
  if (now - hit.listedAt >= LISTING_TTL_MS) {
    listings.delete(prefix);
    return undefined;
  }
  return hit.entries;
}

export function cacheListing(
  prefix: string,
  entries: Map<string, ImageEntryData>,
  now: number = Date.now(),
): void {
  listings.set(prefix, { entries, listedAt: now });
}

/** Drops an item's listing after an upload or delete changes what exists. */
export function invalidateListing(prefix: string): void {
  listings.delete(prefix);
}

/** Test seam. */
export function clearImageCache(): void {
  signedUrls.clear();
  listings.clear();
}

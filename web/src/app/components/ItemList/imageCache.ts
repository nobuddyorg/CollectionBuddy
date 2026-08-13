// Module-level so it outlives the components that read it. ItemList is
// keyed by category id, so switching category unmounts and remounts the
// whole tree -- anything held in hook state is thrown away and every
// signature is fetched again.
//
// Re-signing is not just a round trip: a fresh signature is a different
// URL, so the browser cannot reuse the bytes it already downloaded either.
// Holding signatures steady is what lets the HTTP cache do its job.
//
// Unbounded by construction: entries are only ever evicted when read past
// their TTL (getCachedSignedUrl below), so one never read again outlives
// the tab. Not a leak worth fixing at the scale this app has actually seen
// -- ~100 items x 2 objects x a ~250-byte signed URL is on the order of
// 25 KB. Worth revisiting with a periodic sweep or an LRU cap only if the
// app stops keying ItemList by category, or grows a view that walks many
// categories in one session.

type CachedUrl = { url: string; signedAt: number };

const signedUrls = new Map<string, CachedUrl>();

// Supabase signs for an hour; stop trusting a signature before then so an
// image never resolves to an expired URL mid-render.
export const SIGNED_URL_TTL_MS = 3600_000;
export const SIGNED_URL_MARGIN_MS = 5 * 60_000;

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

/** Test seam. */
export function clearImageCache(): void {
  signedUrls.clear();
}

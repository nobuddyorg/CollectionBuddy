// Module-level so it outlives components: ItemList is keyed by category id,
// so switching category unmounts the whole tree and hook state is thrown
// away. Holding signatures steady here also lets the HTTP cache reuse
// bytes -- a fresh signature is a different URL.
//
// Unbounded by construction: entries only evict when read past their TTL.
// Not a leak worth fixing at this app's actual scale (~25 KB for ~100
// items) -- revisit only if ItemList stops being keyed by category.

type CachedUrl = { url: string; signedAt: number };

const signedUrls = new Map<string, CachedUrl>();

// Supabase signs for an hour; stop trusting a signature before then so an
// image never resolves to an expired URL.
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

// Module-level so it outlives ItemList (keyed by category); a fresh signature is a new, uncached URL.
type CachedUrl = { url: string; signedAt: number };

const signedUrls = new Map<string, CachedUrl>();

// Supabase signs for an hour; a signature is distrusted a margin before that.
export const SIGNED_URL_TTL_MS = 3600_000;
export const SIGNED_URL_MARGIN_MS = 5 * 60_000;

// An aged-out signature stays behind as lastSignedUrl's fallback, until re-signed or forgotten.
export function getCachedSignedUrl(
  path: string,
  now: number = Date.now(),
): string | undefined {
  const hit = signedUrls.get(path);
  if (!hit) return undefined;
  if (now - hit.signedAt >= SIGNED_URL_TTL_MS - SIGNED_URL_MARGIN_MS)
    return undefined;
  return hit.url;
}

/** The newest signature of any age: what a card keeps showing while re-signing fails. */
export function lastSignedUrl(path: string): string | undefined {
  return signedUrls.get(path)?.url;
}

export function cacheSignedUrls(
  entries: Iterable<readonly [string, string]>,
  now: number = Date.now(),
): void {
  for (const [path, url] of entries) {
    signedUrls.set(path, { url, signedAt: now });
  }
}

/** Drops paths Storage answered without a URL, so no stale one outlives its object. */
export function forgetSignedUrls(paths: Iterable<string>): void {
  for (const path of paths) signedUrls.delete(path);
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

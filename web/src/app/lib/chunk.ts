/**
 * Splits `items` into consecutive runs of at most `size` -- the shape every
 * chunked request in the data layer wants, whether the cap is a URL's length
 * or an API's batch limit.
 *
 * Built from a computed count rather than walked with a mutable index: the
 * off-by-one the boundary invites lives here once, where a test can reach it,
 * instead of at every call site.
 */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, i * size + size),
  );
}

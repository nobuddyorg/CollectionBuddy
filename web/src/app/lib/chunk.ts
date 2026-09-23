/** Consecutive runs of at most `size`; the boundary's off-by-one lives here once, where a test reaches it. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, i * size + size),
  );
}

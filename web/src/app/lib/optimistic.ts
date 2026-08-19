/**
 * Puts an entry back into a list at its original index (clamped, since the
 * list may have changed shape while the entry was gone) so it lands among
 * the same neighbours. A no-op if the entry is already back (a resync landed
 * first).
 */
export function restoreAt<T extends { id: string }>(
  list: T[],
  index: number,
  item: T,
): T[] {
  if (list.some((it) => it.id === item.id)) return list;
  const next = [...list];
  next.splice(Math.max(0, Math.min(index, next.length)), 0, item);
  return next;
}

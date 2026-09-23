/** Puts an entry back at its original index, clamped; a no-op if a resync already put it back. */
export function restoreAt<T extends { id: string }>(
  list: T[],
  index: number,
  item: T,
): T[] {
  if (list.some((existing) => existing.id === item.id)) return list;
  const next = [...list];
  next.splice(Math.max(0, Math.min(index, next.length)), 0, item);
  return next;
}

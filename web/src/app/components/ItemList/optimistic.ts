import type { ItemLite } from './types';

/**
 * Puts a card back into the grid after its deletion failed, at its original
 * index (clamped, since the list may have been refetched shorter) so it
 * lands among the same neighbours. A no-op if the card is already back (a
 * silent resync landed first).
 */
export function restoreAt(
  list: ItemLite[],
  index: number,
  item: ItemLite,
): ItemLite[] {
  if (list.some((it) => it.id === item.id)) return list;
  const next = [...list];
  next.splice(Math.max(0, Math.min(index, next.length)), 0, item);
  return next;
}

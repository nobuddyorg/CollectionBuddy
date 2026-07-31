import type { ItemLite } from './types';

/**
 * Puts a card back into the grid after its deletion failed.
 *
 * The index is where the card was before it was optimistically removed, so
 * a restore lands it back among the same neighbours rather than at the end
 * — a card that reappears somewhere else reads as a different card.
 *
 * Two things can have happened while the deletion was in flight: the list
 * may have been refetched shorter (a page boundary moved), so the index is
 * clamped rather than trusted; and the card may already be back (a silent
 * resync landed first), so a restore that would duplicate it does nothing.
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

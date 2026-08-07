import { searchMinLength } from '../../data/items';

/**
 * What the debounced search term means for the grid right now.
 *
 * Lifted out of the component so the live region's wording and the
 * empty-state copy can't drift apart the way they did in #307: both read
 * this instead of re-deriving "is there an active search" from `qDebounced`
 * on their own.
 *
 * - `inactive`: nothing typed, so the grid is the whole category.
 * - `tooShort`: something is typed, but `searchFilterFor` (items.ts) ignores
 *   it -- the grid is *still* the whole category, not a search result.
 * - `active`: the term earned a filter; `total` is a count of matches.
 */
export type SearchStatus =
  | { kind: 'inactive' }
  | { kind: 'tooShort' }
  | { kind: 'active'; total: number };

export function searchStatusFor(
  qDebounced: string,
  total: number,
): SearchStatus {
  if (!qDebounced) return { kind: 'inactive' };
  return qDebounced.length < searchMinLength(qDebounced)
    ? { kind: 'tooShort' }
    : { kind: 'active', total };
}

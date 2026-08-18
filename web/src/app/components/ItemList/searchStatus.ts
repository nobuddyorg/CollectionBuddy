import { searchMinLength } from '../../data/items';

/**
 * What the debounced search term means for the grid right now. Lifted out
 * of the component so the live region's wording and the empty-state copy
 * read the same status instead of re-deriving it separately.
 *
 * - `inactive`: nothing typed, grid is the whole category.
 * - `tooShort`: typed, but too short to filter -- still the whole category.
 * - `active`: the term earned a filter; `total` is the match count.
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

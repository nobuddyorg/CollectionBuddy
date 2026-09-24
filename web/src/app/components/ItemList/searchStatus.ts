import { searchMinLength } from '../../data/itemSearch';

/** Nothing typed; too short to filter (total is the whole category); or filtered, with a match count. */
export type SearchStatus =
  | { kind: 'inactive' }
  | { kind: 'tooShort' }
  | { kind: 'active'; total: number };

export function searchStatusFor(
  debouncedQuery: string,
  total: number,
): SearchStatus {
  if (!debouncedQuery) return { kind: 'inactive' };
  return debouncedQuery.length < searchMinLength(debouncedQuery)
    ? { kind: 'tooShort' }
    : { kind: 'active', total };
}

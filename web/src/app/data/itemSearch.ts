// Escapes LIKE metacharacters and a literal backslash, then wraps the term for a substring match.
function likePattern(needle: string): string {
  const likeEscaped = needle.replace(/\\/g, '\\\\').replace(/[%_]/g, '\\$&');
  return `%${likeEscaped}%`;
}

// Quoted so PostgREST's or=() grammar reads one opaque string, not `, . ( )` as delimiters.
export function buildSearchFilter(needle: string): string {
  const like = likePattern(needle);
  const quoted = like.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `title.ilike."${quoted}",description.ilike."${quoted}",place.ilike."${quoted}",tags_text.ilike."${quoted}"`;
}

// Below 3 characters no trigram can seed the index scan, so ILIKE would scan every row.
export const SEARCH_MIN_LENGTH = 3;

// A non-ASCII character carries more meaning per character, so the floor is lower.
export const SEARCH_MIN_LENGTH_NON_ASCII = 2;

const NON_ASCII_PATTERN = /[^\x00-\x7F]/;

/** The minimum length `search` needs before it earns a filter. */
export function searchMinLength(search: string): number {
  return NON_ASCII_PATTERN.test(search)
    ? SEARCH_MIN_LENGTH_NON_ASCII
    : SEARCH_MIN_LENGTH;
}

/** The or=() filter a term earns, or null when too short; the list and the map share this gate. */
export function searchFilterFor(search: string): string | null {
  return search.length >= searchMinLength(search)
    ? buildSearchFilter(search)
    : null;
}

/** The raw ILIKE pattern for `list_category_places`' `like_pattern`, gated like searchFilterFor. */
export function likePatternFor(search: string): string | null {
  return search.length >= searchMinLength(search) ? likePattern(search) : null;
}

// Escapes LIKE metacharacters and a literal backslash, then wraps the term for a substring match.
function likePattern(needle: string): string {
  const likeEscaped = needle.replace(/\\/g, '\\\\').replace(/[%_]/g, '\\$&');
  return `%${likeEscaped}%`;
}

// `%xy%` holds no trigram in any script, so a shorter term makes Postgres read every collector's entries.
export const SEARCH_MIN_LENGTH = 3;

/** The escaped ILIKE `like_pattern` the search and map RPCs take, or null when the term is too short. */
export function likePatternFor(search: string): string | null {
  return search.length >= SEARCH_MIN_LENGTH ? likePattern(search) : null;
}

import { describe, expect, it } from 'vitest';

import {
  SEARCH_MIN_LENGTH,
  SEARCH_MIN_LENGTH_NON_ASCII,
  buildSearchFilter,
  likePatternFor,
  searchFilterFor,
  searchMinLength,
} from './itemSearch';

// What the server sees after parsing the or=() string, before LIKE's own \% and \_ escapes apply.
function unwrapQuotedValue(filter: string): string {
  const match = filter.match(/title\.ilike\."(.*?)",description\.ilike\./);
  if (!match) throw new Error(`Could not find quoted value in: ${filter}`);
  return match[1].replace(/\\(.)/g, '$1');
}

describe('buildSearchFilter', () => {
  it('produces one ilike clause per searchable column, all quoted the same way', () => {
    const filter = buildSearchFilter('coin');
    expect(filter).toBe(
      'title.ilike."%coin%",description.ilike."%coin%",place.ilike."%coin%",tags_text.ilike."%coin%"',
    );
  });

  it('escapes % so it is not treated as a wildcard', () => {
    const filter = buildSearchFilter('50%');
    expect(unwrapQuotedValue(filter)).toBe('%50\\%%');
  });

  it('escapes _ so it is not treated as a single-char wildcard', () => {
    const filter = buildSearchFilter('a_b');
    expect(unwrapQuotedValue(filter)).toBe('%a\\_b%');
  });

  it('does not corrupt the or=() grouping when the term contains a comma', () => {
    const filter = buildSearchFilter('a,b');
    expect(filter).toContain('"%a,b%"');
    // Exactly 4 top-level clauses -- a stray unquoted comma would produce more.
    expect(filter.split('.ilike.')).toHaveLength(5);
  });

  it('does not close the or=() group early when the term contains a paren', () => {
    const filter = buildSearchFilter('(test)');
    expect(filter).toContain('"%(test)%"');
  });

  it('escapes an embedded double quote', () => {
    const filter = buildSearchFilter('say "hi"');
    expect(filter).toContain('\\"hi\\"');
  });

  it('escapes a literal backslash for both the LIKE and quoting layers', () => {
    const filter = buildSearchFilter('a\\b');
    // The SQL-level LIKE escape for one literal backslash: escape char + the backslash itself.
    expect(unwrapQuotedValue(filter)).toBe('%a\\\\b%');
  });
});

describe('searchFilterFor', () => {
  it('filters on a term long enough to use the trigram indexes', () => {
    expect(searchFilterFor('coin')).toBe(buildSearchFilter('coin'));
  });

  it('filters at exactly the minimum length', () => {
    const term = 'a'.repeat(SEARCH_MIN_LENGTH);
    expect(searchFilterFor(term)).toBe(buildSearchFilter(term));
  });

  it('declines a term one short of the minimum', () => {
    expect(searchFilterFor('a'.repeat(SEARCH_MIN_LENGTH - 1))).toBeNull();
  });

  it('declines an empty term', () => {
    expect(searchFilterFor('')).toBeNull();
  });

  // Two characters earns a filter here, where the same length declines for plain ASCII above.
  it('filters a two-character non-ASCII term', () => {
    expect(searchFilterFor('日本')).toBe(buildSearchFilter('日本'));
    expect(searchFilterFor('日本')).not.toBeNull();
  });

  it('still declines a one-character non-ASCII term', () => {
    expect(searchFilterFor('日')).toBeNull();
  });
});

describe('likePatternFor', () => {
  it('produces the bare %...% pattern for a term long enough to use it', () => {
    expect(likePatternFor('coin')).toBe('%coin%');
  });

  it('declines a term one short of the minimum', () => {
    expect(likePatternFor('a'.repeat(SEARCH_MIN_LENGTH - 1))).toBeNull();
  });

  it('declines an empty term', () => {
    expect(likePatternFor('')).toBeNull();
  });

  it('filters a two-character non-ASCII term', () => {
    expect(likePatternFor('日本')).toBe('%日本%');
  });

  it('escapes % and _ the same way buildSearchFilter does, before quoting', () => {
    expect(likePatternFor('50%')).toBe('%50\\%%');
    expect(likePatternFor('a_b')).toBe('%a\\_b%');
  });

  it('escapes a literal backslash for the LIKE layer', () => {
    expect(likePatternFor('a\\b')).toBe('%a\\\\b%');
  });
});

describe('searchMinLength', () => {
  it('is the ASCII minimum for a plain Latin term', () => {
    expect(searchMinLength('ab')).toBe(SEARCH_MIN_LENGTH);
  });

  it('is lower for a term carrying any non-ASCII character', () => {
    expect(searchMinLength('日本')).toBe(SEARCH_MIN_LENGTH_NON_ASCII);
  });

  it('drops to the non-ASCII floor even for a single non-ASCII character mixed with ASCII', () => {
    expect(searchMinLength('a€')).toBe(SEARCH_MIN_LENGTH_NON_ASCII);
  });
});

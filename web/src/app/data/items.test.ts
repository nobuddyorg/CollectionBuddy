import { describe, expect, it } from 'vitest';

import {
  SEARCH_MIN_LENGTH,
  SEARCH_MIN_LENGTH_NON_ASCII,
  buildSearchFilter,
  listItemPlaces,
  listItems,
  listItemsForExport,
  searchFilterFor,
  searchMinLength,
} from './items';

// Pulls the quoted value back out of `title.ilike."<value>"` and undoes
// PostgREST's own quoted-string escaping, i.e. simulates what the server
// sees after parsing the or=() filter string -- not what SQL sees after
// LIKE pattern matching (that layer still has its own \% / \_ escapes).
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
    // After undoing PostgREST's own quoted-string escaping, what's left
    // must be the SQL-level LIKE escape sequence for one literal
    // backslash: escape-char (\) + literal backslash = "\\".
    expect(unwrapQuotedValue(filter)).toBe('%a\\\\b%');
  });
});

describe('searchFilterFor', () => {
  it('filters on a term long enough to use the trigram indexes', () => {
    expect(searchFilterFor('coin')).toBe(buildSearchFilter('coin'));
  });

  // The boundary itself: at exactly the minimum a term earns its filter.
  it('filters at exactly the minimum length', () => {
    const term = 'a'.repeat(SEARCH_MIN_LENGTH);
    expect(searchFilterFor(term)).toBe(buildSearchFilter(term));
  });

  // Not "no filter, so no narrowing" as an oversight -- a 1-2 character term
  // cannot seed a trigram scan, so filtering on it would cost a sequential
  // scan per keystroke and buy nothing.
  it('declines a term one short of the minimum', () => {
    expect(searchFilterFor('a'.repeat(SEARCH_MIN_LENGTH - 1))).toBeNull();
  });

  it('declines an empty term', () => {
    expect(searchFilterFor('')).toBeNull();
  });

  // A CJK ideograph, a Cyrillic letter, a currency symbol -- each carries
  // more of a search term's meaning than a Latin letter does, so the floor
  // is lower (#307). Two characters already earns a filter here, where the
  // same length declines for a plain ASCII term above.
  it('filters a two-character non-ASCII term', () => {
    expect(searchFilterFor('日本')).toBe(buildSearchFilter('日本'));
    expect(searchFilterFor('日本')).not.toBeNull();
  });

  it('still declines a one-character non-ASCII term', () => {
    expect(searchFilterFor('日')).toBeNull();
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

// The list and the map are two views of one filtered set, built by two
// different queries. What follows reads the request each builder has composed
// -- a PostgREST builder holds its URL and only goes to the network when it is
// awaited, so this asks what would be sent without sending it.
//
// Worth the trouble because the failure it guards is silent: the map used to
// narrow by category and nothing else, so it showed pins for entries the list
// was hiding, and both views looked perfectly sensible on their own (#241).
describe('the queries behind the list and the map', () => {
  const paramsOf = (builder: unknown) =>
    (builder as { url: URL }).url.searchParams;

  const listQuery = (search: string) =>
    paramsOf(listItems({ categoryId: 'cat-1', search, from: 0, to: 8 }));
  const mapQuery = (search: string) =>
    paramsOf(listItemPlaces('cat-1', search));

  it('narrows the map by the same search as the list, character for character', () => {
    // Not merely "both have a filter": the same term has to produce the same
    // filter, or the two views disagree about what matches.
    expect(mapQuery('coin').get('or')).toBe(listQuery('coin').get('or'));
    expect(mapQuery('coin').get('or')).toContain('coin');
  });

  it('narrows the map by category as well', () => {
    expect(mapQuery('coin').get('item_categories.category_id')).toBe(
      'eq.cat-1',
    );
  });

  // Same threshold, or a 2-character search filters one view and not the
  // other -- which is the same bug in a narrower window.
  it('leaves both unfiltered for a term below the minimum length', () => {
    expect(mapQuery('ab').has('or')).toBe(false);
    expect(listQuery('ab').has('or')).toBe(false);
  });

  it('asks only for entries that have a place to draw', () => {
    expect(mapQuery('').getAll('place')).toEqual(['not.is.null', 'neq.']);
  });

  // A page is how many cards fit on a screen; it has nothing to say about how
  // many pins fit on a map. The list pages, the map does not.
  it('does not paginate the map', () => {
    expect(mapQuery('coin').has('limit')).toBe(false);
    expect(mapQuery('coin').has('offset')).toBe(false);
  });

  const exportQuery = () => paramsOf(listItemsForExport('cat-1', 0, 499));

  // Silently reversed, this would flip the order every popup lists its
  // entries in -- invisible until read against the list it's meant to
  // agree with (usePlaces.test.ts states this order as an assumed premise).
  it('orders the map newest-first, the same as the list', () => {
    expect(mapQuery('coin').get('order')).toBe(listQuery('coin').get('order'));
    expect(listQuery('coin').get('order')).toBe('created_at.desc');
  });

  // Oldest-first, the reverse of the list and the map: the archive numbers
  // its folders in the order it walks them, and a `created_at` tie is
  // broken by `id` so which page a tied row lands on is never ambiguous
  // across the .range() boundary (#424).
  it('orders the export oldest-first with id as a tiebreaker', () => {
    expect(exportQuery().get('order')).toBe('created_at.asc,id.asc');
  });

  // Silently dropping this would truncate every future export to whatever
  // happened to be typed into the search box at the moment the button was
  // pressed -- an export is of the category, not of the live filter.
  it('never filters the export by search', () => {
    expect(exportQuery().has('or')).toBe(false);
  });

  it('pages the export the same way range() was asked to', () => {
    expect(exportQuery().get('offset')).toBe('0');
    expect(exportQuery().get('limit')).toBe('500');
  });
});

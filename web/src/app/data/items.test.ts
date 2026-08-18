import { describe, expect, it, vi } from 'vitest';

import {
  ITEM_PLACE_PAGE_SIZE,
  SEARCH_MIN_LENGTH,
  SEARCH_MIN_LENGTH_NON_ASCII,
  buildSearchFilter,
  listItemPlaces,
  listItems,
  listItemsForExport,
  rawListItemPlaces,
  searchFilterFor,
  searchMinLength,
} from './items';

// Simulates what the server sees after parsing the or=() filter string, not
// what SQL sees after LIKE pattern matching (that layer has its own \% / \_
// escapes).
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
    // The SQL-level LIKE escape sequence for one literal backslash:
    // escape-char (\) + literal backslash = "\\".
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

  // Two characters earns a filter here, where the same length declines for
  // a plain ASCII term above.
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

// A PostgREST builder holds its URL and only hits the network when awaited,
// so this reads what request each builder composed without sending it.
describe('the queries behind the list and the map', () => {
  const paramsOf = (builder: unknown) =>
    (builder as { url: URL }).url.searchParams;

  const listQuery = (search: string) =>
    paramsOf(listItems({ categoryId: 'cat-1', search, from: 0, to: 8 }));
  const mapQuery = (search: string) =>
    paramsOf(rawListItemPlaces('cat-1', search, 0, ITEM_PLACE_PAGE_SIZE - 1));

  it('narrows the map by the same search as the list, character for character', () => {
    expect(mapQuery('coin').get('or')).toBe(listQuery('coin').get('or'));
    expect(mapQuery('coin').get('or')).toContain('coin');
  });

  it('narrows the map by category as well', () => {
    expect(mapQuery('coin').get('item_categories.category_id')).toBe(
      'eq.cat-1',
    );
  });

  it('leaves both unfiltered for a term below the minimum length', () => {
    expect(mapQuery('ab').has('or')).toBe(false);
    expect(listQuery('ab').has('or')).toBe(false);
  });

  it('asks only for entries that have a place to draw', () => {
    expect(mapQuery('').getAll('place')).toEqual(['not.is.null', 'neq.']);
  });

  it('pages the map the same way the export pages', () => {
    expect(mapQuery('coin').get('offset')).toBe('0');
    expect(mapQuery('coin').get('limit')).toBe(String(ITEM_PLACE_PAGE_SIZE));
  });

  const exportQuery = () => paramsOf(listItemsForExport('cat-1', 0, 499));

  it('orders the map newest-first, the same as the list', () => {
    expect(mapQuery('coin').get('order')).toBe(listQuery('coin').get('order'));
    expect(listQuery('coin').get('order')).toBe('created_at.desc');
  });

  it('orders the export oldest-first with id as a tiebreaker', () => {
    expect(exportQuery().get('order')).toBe('created_at.asc,id.asc');
  });

  it('never filters the export by search', () => {
    expect(exportQuery().has('or')).toBe(false);
  });

  it('pages the export the same way range() was asked to', () => {
    expect(exportQuery().get('offset')).toBe('0');
    expect(exportQuery().get('limit')).toBe('500');
  });
});

describe('listItemPlaces', () => {
  it('pages past a full page and concatenates the rows', async () => {
    const fullPage = Array.from({ length: ITEM_PLACE_PAGE_SIZE }, (_, i) => ({
      title: `item-${i}`,
      place: 'Berlin',
      place_lat: 52.5,
      place_lng: 13.4,
    }));
    const shortPage = [
      { title: 'last', place: 'Berlin', place_lat: 52.5, place_lng: 13.4 },
    ];
    const listPage = vi
      .fn()
      .mockResolvedValueOnce({ data: fullPage, error: null })
      .mockResolvedValueOnce({ data: shortPage, error: null });

    const { data, error } = await listItemPlaces(
      'cat-1',
      '',
      undefined,
      listPage,
    );

    expect(error).toBeNull();
    expect(data).toHaveLength(ITEM_PLACE_PAGE_SIZE + 1);
    expect(listPage).toHaveBeenCalledTimes(2);
    expect(listPage).toHaveBeenNthCalledWith(
      1,
      'cat-1',
      '',
      0,
      ITEM_PLACE_PAGE_SIZE - 1,
      undefined,
    );
    expect(listPage).toHaveBeenNthCalledWith(
      2,
      'cat-1',
      '',
      ITEM_PLACE_PAGE_SIZE,
      2 * ITEM_PLACE_PAGE_SIZE - 1,
      undefined,
    );
  });

  it('stops on the first page that errors, returning no partial data', async () => {
    const listPage = vi
      .fn()
      .mockResolvedValue({ data: null, error: new Error('boom') });

    const { data, error } = await listItemPlaces(
      'cat-1',
      '',
      undefined,
      listPage,
    );

    expect(data).toBeNull();
    expect(error).toBeInstanceOf(Error);
    expect(listPage).toHaveBeenCalledTimes(1);
  });

  it('stops after a single short page without a second request', async () => {
    const listPage = vi
      .fn()
      .mockResolvedValue({ data: [{ title: 'only' }], error: null });

    const { data } = await listItemPlaces('cat-1', '', undefined, listPage);

    expect(data).toHaveLength(1);
    expect(listPage).toHaveBeenCalledTimes(1);
  });

  it('stops rather than crashing when a page comes back with no data and no error', async () => {
    const listPage = vi.fn().mockResolvedValue({ data: null, error: null });

    const { data, error } = await listItemPlaces(
      'cat-1',
      '',
      undefined,
      listPage,
    );

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});

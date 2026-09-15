import { describe, expect, it, vi } from 'vitest';

import {
  SEARCH_MIN_LENGTH,
  SEARCH_MIN_LENGTH_NON_ASCII,
  buildSearchFilter,
  likePatternFor,
  listCategoryPlaces,
  listItems,
  listItemsForExport,
  rawCountItems,
  rawListCategoryPlaces,
  rawListItems,
  rawSearchCategoryItems,
  searchFilterFor,
  searchMinLength,
  updateItemsPlace,
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

// A PostgREST builder holds its URL and only hits the network when awaited,
// so this reads what request each builder composed without sending it.
describe('the queries behind the list and the map', () => {
  const paramsOf = (builder: unknown) =>
    (builder as { url: URL }).url.searchParams;

  const listQuery = (search: string) =>
    paramsOf(rawListItems({ categoryId: 'cat-1', search, from: 0, to: 8 }));
  const mapQuery = (search: string) =>
    paramsOf(rawListCategoryPlaces('cat-1', search));
  const countBuilder = (search: string) =>
    rawCountItems({ categoryId: 'cat-1', search }) as unknown as {
      url: URL;
      method: string;
      headers: Headers;
    };

  it('calls the grouped-places RPC as a GET, with the category and a raw LIKE pattern', () => {
    const params = mapQuery('coin');
    expect(params.get('cat_id')).toBe('cat-1');
    expect(params.get('like_pattern')).toBe('%coin%');
    expect(
      (rawListCategoryPlaces('cat-1', 'coin') as unknown as { method: string })
        .method,
    ).toBe('GET');
  });

  it('omits like_pattern rather than sending it as the literal text "null"', () => {
    expect(mapQuery('').has('like_pattern')).toBe(false);
    expect(mapQuery('ab').has('like_pattern')).toBe(false);
  });

  it('narrows the map by the same escaping and minimum length as the list', () => {
    expect(mapQuery('coin').get('like_pattern')).toBe(likePatternFor('coin'));
    expect(mapQuery('50%').get('like_pattern')).toBe(likePatternFor('50%'));
  });

  const searchParamsOf = (search: string) =>
    paramsOf(
      rawSearchCategoryItems({
        categoryId: 'cat-1',
        likePattern: likePatternFor(search)!,
        from: 0,
        to: 8,
      }),
    );

  it('calls the searched-items RPC as a GET, with the category, pattern and page bounds', () => {
    const params = searchParamsOf('coin');
    expect(params.get('cat_id')).toBe('cat-1');
    expect(params.get('like_pattern')).toBe(likePatternFor('coin'));
    expect(params.get('page_from')).toBe('0');
    expect(params.get('page_to')).toBe('8');
    expect(
      (
        rawSearchCategoryItems({
          categoryId: 'cat-1',
          likePattern: '%coin%',
          from: 0,
          to: 8,
        }) as unknown as { method: string }
      ).method,
    ).toBe('GET');
  });

  // The list is driven from item_categories itself (#618, #619) rather than
  // from items with an embedded item_categories filter, so category_id is a
  // plain column filter here instead of the embedded-table one the map still
  // uses above.
  it('narrows the list by category as a plain column filter, not an embedded one', () => {
    expect(listQuery('coin').get('category_id')).toBe('eq.cat-1');
  });

  it('drives the list from item_categories, embedding items as the inner join that carries the search filter', () => {
    expect(listQuery('coin').get('select')).toBe(
      'items!inner(id,title,description,place,place_lat,place_lng,tags)',
    );
  });

  // The exact total is a separate, cheaper request from the page itself
  // (#PERF-H3): counting through the items join costs a join on every row
  // even with nothing to filter on, where a bare item_categories count
  // measures ~15x cheaper.
  it('counts item_categories alone, with no join to items, when there is no search filter', () => {
    const builder = countBuilder('');
    expect(builder.url.searchParams.get('select')).toBe('item_id');
    expect(builder.method).toBe('HEAD');
    expect(builder.headers.get('Prefer')).toContain('count=exact');
  });

  it('narrows the count query by category the same way the page query is', () => {
    expect(countBuilder('').url.searchParams.get('category_id')).toBe(
      'eq.cat-1',
    );
  });

  it('brings the items join back into the count only once a search filter applies', () => {
    const builder = countBuilder('coin');
    expect(builder.url.searchParams.get('select')).toBe(
      'items!inner(id,title,description,place,place_lat,place_lng,tags)',
    );
    expect(builder.method).toBe('HEAD');
    expect(builder.headers.get('Prefer')).toContain('count=exact');
    expect(builder.url.searchParams.get('items.or')).toBe(
      listQuery('coin').get('items.or'),
    );
  });

  it('leaves the count query unfiltered for a search term below the minimum length', () => {
    expect(countBuilder('ab').url.searchParams.get('select')).toBe('item_id');
  });

  it('leaves the list unfiltered for a term below the minimum length', () => {
    expect(listQuery('ab').has('items.or')).toBe(false);
  });

  const exportQuery = () => paramsOf(listItemsForExport('cat-1', 0, 499));

  it('orders the list newest-first', () => {
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

describe('listItems', () => {
  function item(id: string) {
    return {
      id,
      title: id,
      description: null,
      place: null,
      place_lat: null,
      place_lng: null,
      tags: [],
    };
  }

  it('unwraps each row to the item it embeds, combining it with the count from the separate count request', async () => {
    const rawList = vi.fn().mockResolvedValue({
      data: [{ items: item('a') }, { items: item('b') }],
      error: null,
    });
    const rawCount = vi.fn().mockResolvedValue({ count: 2, error: null });

    const { data, error, count } = await listItems(
      { categoryId: 'cat-1', search: '', from: 0, to: 8 },
      rawList,
      rawCount,
    );

    expect(error).toBeNull();
    expect(count).toBe(2);
    expect(data).toEqual([item('a'), item('b')]);
    expect(rawList).toHaveBeenCalledWith({
      categoryId: 'cat-1',
      search: '',
      from: 0,
      to: 8,
    });
    expect(rawCount).toHaveBeenCalledWith({
      categoryId: 'cat-1',
      search: '',
      from: 0,
      to: 8,
    });
  });

  it('returns no data and a null count when the page request errors, without touching the rows', async () => {
    const rawList = vi
      .fn()
      .mockResolvedValue({ data: null, error: new Error('boom') });
    const rawCount = vi.fn().mockResolvedValue({ count: 5, error: null });

    const { data, error, count } = await listItems(
      { categoryId: 'cat-1', search: '', from: 0, to: 8 },
      rawList,
      rawCount,
    );

    expect(data).toBeNull();
    expect(error).toBeInstanceOf(Error);
    expect(count).toBeNull();
  });

  it('returns no data and a null count when the count request errors, even though the page succeeded', async () => {
    const rawList = vi
      .fn()
      .mockResolvedValue({ data: [{ items: item('a') }], error: null });
    const rawCount = vi
      .fn()
      .mockResolvedValue({ count: null, error: new Error('boom') });

    const { data, error, count } = await listItems(
      { categoryId: 'cat-1', search: '', from: 0, to: 8 },
      rawList,
      rawCount,
    );

    expect(data).toBeNull();
    expect(error).toBeInstanceOf(Error);
    expect(count).toBeNull();
  });

  it('flattens to an empty page rather than crashing when a successful response carries no rows', async () => {
    const rawList = vi.fn().mockResolvedValue({ data: null, error: null });
    const rawCount = vi.fn().mockResolvedValue({ count: 0, error: null });

    const { data, error, count } = await listItems(
      { categoryId: 'cat-1', search: '', from: 0, to: 8 },
      rawList,
      rawCount,
    );

    expect(error).toBeNull();
    expect(count).toBe(0);
    expect(data).toEqual([]);
  });
});

describe('listItems, once a search term earns a filter', () => {
  function searchRow(id: string, totalCount: number) {
    return {
      id,
      title: id,
      description: null,
      place: null,
      place_lat: null,
      place_lng: null,
      tags: [],
      total_count: totalCount,
    };
  }

  it('calls the search RPC instead of the plain list/count pair', async () => {
    const rawList = vi.fn();
    const rawCount = vi.fn();
    const rawSearch = vi
      .fn()
      .mockResolvedValue({ data: [searchRow('a', 1)], error: null });

    await listItems(
      { categoryId: 'cat-1', search: 'coin', from: 0, to: 8 },
      rawList,
      rawCount,
      rawSearch,
    );

    expect(rawList).not.toHaveBeenCalled();
    expect(rawCount).not.toHaveBeenCalled();
    expect(rawSearch).toHaveBeenCalledWith({
      categoryId: 'cat-1',
      likePattern: likePatternFor('coin'),
      from: 0,
      to: 8,
      signal: undefined,
    });
  });

  it('strips total_count off each row and reads the exact total from it', async () => {
    const rawSearch = vi.fn().mockResolvedValue({
      data: [searchRow('a', 5), searchRow('b', 5)],
      error: null,
    });

    const { data, error, count } = await listItems(
      { categoryId: 'cat-1', search: 'coin', from: 0, to: 8 },
      undefined,
      undefined,
      rawSearch,
    );

    expect(error).toBeNull();
    expect(count).toBe(5);
    expect(data).toEqual([
      {
        id: 'a',
        title: 'a',
        description: null,
        place: null,
        place_lat: null,
        place_lng: null,
        tags: [],
      },
      {
        id: 'b',
        title: 'b',
        description: null,
        place: null,
        place_lat: null,
        place_lng: null,
        tags: [],
      },
    ]);
  });

  it('reports a count of zero rather than null when nothing matched', async () => {
    const rawSearch = vi.fn().mockResolvedValue({ data: [], error: null });

    const { data, error, count } = await listItems(
      { categoryId: 'cat-1', search: 'coin', from: 0, to: 8 },
      undefined,
      undefined,
      rawSearch,
    );

    expect(error).toBeNull();
    expect(count).toBe(0);
    expect(data).toEqual([]);
  });

  it('flattens to an empty page rather than crashing when a successful response carries no rows', async () => {
    const rawSearch = vi.fn().mockResolvedValue({ data: null, error: null });

    const { data, error, count } = await listItems(
      { categoryId: 'cat-1', search: 'coin', from: 0, to: 8 },
      undefined,
      undefined,
      rawSearch,
    );

    expect(error).toBeNull();
    expect(count).toBe(0);
    expect(data).toEqual([]);
  });

  it('returns no data and a null count when the search request errors', async () => {
    const rawSearch = vi
      .fn()
      .mockResolvedValue({ data: null, error: new Error('boom') });

    const { data, error, count } = await listItems(
      { categoryId: 'cat-1', search: 'coin', from: 0, to: 8 },
      undefined,
      undefined,
      rawSearch,
    );

    expect(data).toBeNull();
    expect(error).toBeInstanceOf(Error);
    expect(count).toBeNull();
  });

  it('leaves the plain list/count pair in charge for a term below the minimum length', async () => {
    const rawList = vi.fn().mockResolvedValue({ data: [], error: null });
    const rawCount = vi.fn().mockResolvedValue({ count: 0, error: null });
    const rawSearch = vi.fn();

    await listItems(
      { categoryId: 'cat-1', search: 'ab', from: 0, to: 8 },
      rawList,
      rawCount,
      rawSearch,
    );

    expect(rawSearch).not.toHaveBeenCalled();
    expect(rawList).toHaveBeenCalled();
    expect(rawCount).toHaveBeenCalled();
  });
});

describe('listCategoryPlaces', () => {
  it('passes the rows straight through on success', async () => {
    const rows = [
      {
        place: 'Bonn',
        place_lat: 50.7,
        place_lng: 7.1,
        titles: ['a'],
        ids: ['1'],
      },
    ];
    const rawList = vi.fn().mockResolvedValue({ data: rows, error: null });

    const { data, error } = await listCategoryPlaces(
      'cat-1',
      '',
      undefined,
      rawList,
    );

    expect(error).toBeNull();
    expect(data).toEqual(rows);
    expect(rawList).toHaveBeenCalledWith('cat-1', '', undefined);
  });

  it('reports the error and no data when the request fails', async () => {
    const rawList = vi
      .fn()
      .mockResolvedValue({ data: null, error: new Error('rls') });

    const { data, error } = await listCategoryPlaces(
      'cat-1',
      '',
      undefined,
      rawList,
    );

    expect(data).toBeNull();
    expect(error).toBeInstanceOf(Error);
  });

  it('reports null data for a success response that carried none', async () => {
    const rawList = vi.fn().mockResolvedValue({ data: null, error: null });

    const { data, error } = await listCategoryPlaces(
      'cat-1',
      '',
      undefined,
      rawList,
    );

    expect(error).toBeNull();
    expect(data).toBeNull();
  });
});

describe('updateItemsPlace', () => {
  it('writes the payload in a single call for a list under the chunk size', async () => {
    const updatePage = vi.fn().mockResolvedValue({ error: null });

    const { error } = await updateItemsPlace(
      ['a', 'b'],
      { place_lat: 50.7, place_lng: 7.1 },
      updatePage,
    );

    expect(error).toBeNull();
    expect(updatePage).toHaveBeenCalledTimes(1);
    expect(updatePage).toHaveBeenCalledWith(['a', 'b'], {
      place_lat: 50.7,
      place_lng: 7.1,
    });
  });

  // `.in()` puts every id in the query string; a place shared by thousands
  // of items would hit a URL length limit before any row cap does, hence
  // chunking (#PERF-H6).
  it('chunks an id list over 100 into multiple calls, carrying the same payload', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
    const updatePage = vi.fn().mockResolvedValue({ error: null });
    const payload = { place_lat: 50.7, place_lng: 7.1 };

    const { error } = await updateItemsPlace(ids, payload, updatePage);

    expect(error).toBeNull();
    expect(updatePage).toHaveBeenCalledTimes(3);
    expect(updatePage).toHaveBeenNthCalledWith(1, ids.slice(0, 100), payload);
    expect(updatePage).toHaveBeenNthCalledWith(2, ids.slice(100, 200), payload);
    expect(updatePage).toHaveBeenNthCalledWith(3, ids.slice(200, 250), payload);
  });

  it('asks nothing more of a list that fills its last chunk exactly', async () => {
    const ids = Array.from({ length: 200 }, (_, i) => `id-${i}`);
    const updatePage = vi.fn().mockResolvedValue({ error: null });

    await updateItemsPlace(ids, { place_lat: 0, place_lng: 0 }, updatePage);

    expect(updatePage).toHaveBeenCalledTimes(2);
  });

  it('stops on the first chunk that errors, without writing the rest', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
    const updatePage = vi
      .fn()
      .mockResolvedValueOnce({ error: new Error('boom') });

    const { error } = await updateItemsPlace(
      ids,
      { place_lat: 0, place_lng: 0 },
      updatePage,
    );

    expect(error).toBeInstanceOf(Error);
    expect(updatePage).toHaveBeenCalledTimes(1);
  });
});

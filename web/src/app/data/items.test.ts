import { describe, expect, it, vi } from 'vitest';

import {
  SEARCH_MIN_LENGTH,
  SEARCH_MIN_LENGTH_NON_ASCII,
  buildSearchFilter,
  createItem,
  createItems,
  deleteItem,
  deleteItems,
  linkItemToCategory,
  linkItemsToCategory,
  rawUpdateItemsPlace,
  updateItem,
  likePatternFor,
  listCategoryPlaces,
  listItems,
  exportCursorFilter,
  listItemsForExport,
  rawListItemsForExport,
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
    const builder = rawListCategoryPlaces('cat-1', 'coin') as unknown as {
      method: string;
      url: URL;
    };
    expect(builder.method).toBe('GET');
    // Naming the wrong function is a 404 at runtime and nothing at compile
    // time, so the function actually addressed is worth pinning.
    expect(builder.url.pathname).toMatch(/\/rpc\/list_category_places$/);
  });

  it('carries an abort signal through to each cancellable query', () => {
    const controller = new AbortController();
    const signalOf = (builder: unknown) =>
      (builder as { signal?: AbortSignal }).signal;

    expect(
      signalOf(
        rawListItems({
          categoryId: 'cat-1',
          search: '',
          from: 0,
          to: 8,
          signal: controller.signal,
        }),
      ),
    ).toBe(controller.signal);
    expect(
      signalOf(
        rawCountItems({
          categoryId: 'cat-1',
          search: '',
          signal: controller.signal,
        }),
      ),
    ).toBe(controller.signal);
    expect(
      signalOf(
        rawCountItems({
          categoryId: 'cat-1',
          search: 'coin',
          signal: controller.signal,
        }),
      ),
    ).toBe(controller.signal);
    expect(
      signalOf(
        rawSearchCategoryItems({
          categoryId: 'cat-1',
          likePattern: '%coin%',
          from: 0,
          to: 8,
          signal: controller.signal,
        }),
      ),
    ).toBe(controller.signal);
    expect(
      signalOf(rawListCategoryPlaces('cat-1', 'coin', controller.signal)),
    ).toBe(controller.signal);
  });

  it('leaves a query with nothing to cancel without a signal', () => {
    expect(
      (
        rawListItems({
          categoryId: 'cat-1',
          search: '',
          from: 0,
          to: 8,
        }) as unknown as {
          signal?: AbortSignal;
        }
      ).signal,
    ).toBeUndefined();
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
    expect(
      (
        rawSearchCategoryItems({
          categoryId: 'cat-1',
          likePattern: '%coin%',
          from: 0,
          to: 8,
        }) as unknown as { url: URL }
      ).url.pathname,
    ).toMatch(/\/rpc\/search_category_items$/);
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

  it('drives the list from item_categories, embedding items as the inner join that carries the search filter, and their photographs', () => {
    expect(listQuery('coin').get('select')).toBe(
      'items!inner(id,title,description,place,place_lat,place_lng,tags,images(id,item_id,path_full,path_thumb))',
    );
  });

  it("orders each item's embedded photographs oldest-first, id breaking ties", () => {
    expect(listQuery('').get('items.images.order')).toBe(
      'created_at.asc,id.asc',
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
    // And still does once the search filter brings the items join back:
    // a count over the whole table would report someone else's total.
    expect(countBuilder('coin').url.searchParams.get('category_id')).toBe(
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

  const cursor = {
    linkedAt: '2026-01-02T03:04:05.123456+00:00',
    itemId: 'item-9',
  };
  const exportQuery = (after: typeof cursor | null = null) =>
    paramsOf(rawListItemsForExport('cat-1', { after, size: 500 }));

  it('orders the list newest-first, the item id breaking ties', () => {
    expect(listQuery('coin').get('order')).toBe('created_at.desc,item_id.asc');
  });

  it('orders the export oldest-first with the item id as a tiebreaker', () => {
    expect(exportQuery().get('order')).toBe('created_at.asc,item_id.asc');
  });

  it('never filters the export by search', () => {
    expect(exportQuery().has('or')).toBe(false);
  });

  it('drives the export from the category link, embedding every listed field plus the timestamp', () => {
    expect(exportQuery().get('select')).toBe(
      'created_at,item_id,items!inner(id,title,description,place,place_lat,place_lng,tags,created_at)',
    );
    expect(exportQuery().get('category_id')).toBe('eq.cat-1');
  });

  it('asks for one page of the requested size, with no offset', () => {
    expect(exportQuery().get('limit')).toBe('500');
    expect(exportQuery().has('offset')).toBe(false);
  });

  it('starts the first page at the beginning, with no cursor bound', () => {
    expect(exportQuery().has('created_at')).toBe(false);
  });

  it('starts a later page strictly after the cursor row', () => {
    const params = exportQuery(cursor);
    expect(params.get('created_at')).toBe(
      'gte.2026-01-02T03:04:05.123456+00:00',
    );
    expect(params.get('or')).toBe(`(${exportCursorFilter(cursor)})`);
  });
});

describe('exportCursorFilter', () => {
  it('matches a later timestamp, or the same one with a later item id, both quoted', () => {
    expect(
      exportCursorFilter({
        linkedAt: '2026-01-02T03:04:05+00:00',
        itemId: 'b',
      }),
    ).toBe(
      'created_at.gt."2026-01-02T03:04:05+00:00",and(created_at.eq."2026-01-02T03:04:05+00:00",item_id.gt."b")',
    );
  });
});

describe('listItemsForExport', () => {
  function link(id: string) {
    return {
      created_at: `2026-01-0${id}T00:00:00+00:00`,
      item_id: id,
      items: {
        id,
        title: id,
        description: null,
        place: null,
        place_lat: null,
        place_lng: null,
        tags: [],
        created_at: `item-created-${id}`,
      },
    };
  }
  const rawReturning = (result: unknown) =>
    vi.fn(async () => result) as unknown as typeof rawListItemsForExport;

  it('passes the category and page through to the query', async () => {
    const raw = rawReturning({ data: [], error: null });
    const page = { after: null, size: 2 };

    await listItemsForExport('cat-1', page, raw);

    expect(raw).toHaveBeenCalledWith('cat-1', page);
  });

  it('flattens a full page to its items, pointing the cursor at its last link', async () => {
    const raw = rawReturning({
      data: [link('1'), link('2'), link('3')],
      error: null,
    });

    const result = await listItemsForExport(
      'cat-1',
      { after: null, size: 3 },
      raw,
    );

    expect(result).toEqual({
      data: {
        items: [link('1').items, link('2').items, link('3').items],
        next: { linkedAt: '2026-01-03T00:00:00+00:00', itemId: '3' },
      },
      error: null,
    });
  });

  it('ends the walk on a short page', async () => {
    const raw = rawReturning({ data: [link('1')], error: null });

    const result = await listItemsForExport(
      'cat-1',
      { after: null, size: 2 },
      raw,
    );

    expect(result.data?.next).toBeNull();
  });

  it('ends the walk on an empty or missing page', async () => {
    for (const data of [[], null]) {
      const result = await listItemsForExport(
        'cat-1',
        { after: null, size: 2 },
        rawReturning({ data, error: null }),
      );
      expect(result).toEqual({ data: { items: [], next: null }, error: null });
    }
  });

  it('hands back an error with no partial page', async () => {
    const boom = { message: 'boom' };

    const result = await listItemsForExport(
      'cat-1',
      { after: null, size: 2 },
      rawReturning({ data: [link('1'), link('2')], error: boom }),
    );

    expect(result).toEqual({ data: null, error: boom });
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
  // What the page read embeds per link row: the item plus its photographs.
  function pageRow(id: string, images: unknown[] = []) {
    return { items: { ...item(id), images } };
  }

  it('unwraps each row to the item it embeds, combining it with the count from the separate count request', async () => {
    const rawList = vi.fn().mockResolvedValue({
      data: [pageRow('a'), pageRow('b')],
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

  it("hands back the page's photograph rows alongside its items, in item order", async () => {
    const photo = (id: string, itemId: string) => ({
      id,
      item_id: itemId,
      path_full: `u/${itemId}/${id}.webp`,
      path_thumb: null,
    });
    const rawList = vi.fn().mockResolvedValue({
      data: [
        pageRow('a', [photo('p1', 'a'), photo('p2', 'a')]),
        pageRow('b', [photo('p3', 'b')]),
      ],
      error: null,
    });
    const rawCount = vi.fn().mockResolvedValue({ count: 2, error: null });

    const { data, imageRows } = await listItems(
      { categoryId: 'cat-1', search: '', from: 0, to: 8 },
      rawList,
      rawCount,
    );

    expect(data).toEqual([item('a'), item('b')]);
    expect(imageRows).toEqual([
      photo('p1', 'a'),
      photo('p2', 'a'),
      photo('p3', 'b'),
    ]);
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
      .mockResolvedValue({ data: [pageRow('a')], error: null });
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

    const { data, error, count, imageRows } = await listItems(
      { categoryId: 'cat-1', search: 'coin', from: 0, to: 8 },
      undefined,
      undefined,
      rawSearch,
    );

    expect(error).toBeNull();
    expect(count).toBe(5);
    // The RPC carries no photographs; the caller lists those itself.
    expect(imageRows).toBeNull();
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

// Same trick as the read queries above: a PostgREST builder composes its
// request eagerly and only sends it when awaited, so each write can be read
// back without a server.
describe('the queries behind creating, editing and deleting an entry', () => {
  const requestOf = (builder: unknown) =>
    builder as {
      url: URL;
      method: string;
      headers: Headers;
      body?: unknown;
    };

  const fields = {
    title: 'Sixpence',
    description: null,
    place: null,
    place_lat: null,
    place_lng: null,
    tags: [],
  };

  it('inserts an entry into items and asks only for the new id back', () => {
    const req = requestOf(createItem(fields));

    expect(req.url.pathname).toMatch(/\/items$/);
    expect(req.method).toBe('POST');
    expect(req.url.searchParams.get('select')).toBe('id');
    expect(req.headers.get('Accept')).toContain('pgrst.object');
  });

  // enforce_user_id() (0002_functions.sql) fills user_id in from the JWT.
  // A client that sent one of its own would be handing the row to whoever
  // it named, so the payload going over the wire must be the fields alone.
  it('sends the entry fields and nothing else -- never a user_id', () => {
    const req = requestOf(createItem(fields));

    expect(req.body).toEqual(fields);
  });

  it('updates exactly the named row and reads back every field the list shows', () => {
    const req = requestOf(updateItem('item-1', { title: 'Renamed' }));

    expect(req.url.pathname).toMatch(/\/items$/);
    expect(req.method).toBe('PATCH');
    expect(req.url.searchParams.get('id')).toBe('eq.item-1');
    expect(req.url.searchParams.get('select')).toBe(
      'id,title,description,place,place_lat,place_lng,tags',
    );
    expect(req.body).toEqual({ title: 'Renamed' });
    expect(req.headers.get('Accept')).toContain('pgrst.object');
  });

  it('writes one place over a whole chunk of ids in a single request', () => {
    const req = requestOf(
      rawUpdateItemsPlace(['a', 'b'], { place_lat: 1.5, place_lng: 2.5 }),
    );

    expect(req.url.pathname).toMatch(/\/items$/);
    expect(req.method).toBe('PATCH');
    expect(req.url.searchParams.get('id')).toBe('in.(a,b)');
    expect(req.body).toEqual({ place_lat: 1.5, place_lng: 2.5 });
  });

  // A bare .delete() reports an RLS refusal as `{ error: null }`; asking for
  // the deleted id back is what turns "zero rows affected" into an error.
  it('deletes exactly the named row and asks for its id back', () => {
    const req = requestOf(deleteItem('item-1'));

    expect(req.url.pathname).toMatch(/\/items$/);
    expect(req.method).toBe('DELETE');
    expect(req.url.searchParams.get('id')).toBe('eq.item-1');
    expect(req.url.searchParams.get('select')).toBe('id');
    expect(req.headers.get('Accept')).toContain('pgrst.object');
  });

  it('links an entry to a category by both ids, and derives the rest server-side', () => {
    const req = requestOf(linkItemToCategory('item-1', 'cat-1'));

    expect(req.url.pathname).toMatch(/\/item_categories$/);
    expect(req.method).toBe('POST');
    expect(req.body).toEqual({ item_id: 'item-1', category_id: 'cat-1' });
  });

  it("inserts a whole import batch in one request, with the caller's ids and timestamps but no user_id", () => {
    const rows = [
      { ...fields, id: 'a', created_at: '2026-01-01T00:00:00.000Z' },
      { ...fields, id: 'b', created_at: '2026-01-01T00:00:00.001Z' },
    ];
    const req = requestOf(createItems(rows));

    expect(req.url.pathname).toMatch(/\/items$/);
    expect(req.method).toBe('POST');
    expect(req.body).toEqual(rows);
  });

  it('links a whole import batch to its category in one request', () => {
    const links = [
      { item_id: 'a', category_id: 'cat-1', created_at: 't1' },
      { item_id: 'b', category_id: 'cat-1', created_at: 't2' },
    ];
    const req = requestOf(linkItemsToCategory(links));

    expect(req.url.pathname).toMatch(/\/item_categories$/);
    expect(req.method).toBe('POST');
    expect(req.body).toEqual(links);
  });

  it('deletes a batch of entries by id in one request', () => {
    const req = requestOf(deleteItems(['a', 'b']));

    expect(req.url.pathname).toMatch(/\/items$/);
    expect(req.method).toBe('DELETE');
    expect(req.url.searchParams.get('id')).toBe('in.(a,b)');
  });
});

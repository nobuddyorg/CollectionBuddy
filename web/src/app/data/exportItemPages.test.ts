import { describe, expect, it, vi } from 'vitest';

import {
  exportCursorFilter,
  listItemsForExport,
  rawListItemsForExport,
} from './exportItemPages';

// A PostgREST builder holds its URL and only hits the network when awaited.
describe('the query behind an export page', () => {
  const cursor = {
    linkedAt: '2026-01-02T03:04:05.123456+00:00',
    itemId: 'item-9',
  };
  const exportQuery = (after: typeof cursor | null = null) =>
    (
      rawListItemsForExport({
        categoryId: 'cat-1',
        after,
        size: 500,
      }) as unknown as { url: URL }
    ).url.searchParams;

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

  it('passes the page request through to the query', async () => {
    const raw = rawReturning({ data: [], error: null });
    const page = { categoryId: 'cat-1', after: null, size: 2 };

    await listItemsForExport(page, raw);

    expect(raw).toHaveBeenCalledWith(page);
  });

  it('flattens a full page to its items, pointing the cursor at its last link', async () => {
    const raw = rawReturning({
      data: [link('1'), link('2'), link('3')],
      error: null,
    });

    const result = await listItemsForExport(
      { categoryId: 'cat-1', after: null, size: 3 },
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
      { categoryId: 'cat-1', after: null, size: 2 },
      raw,
    );

    expect(result.data?.next).toBeNull();
  });

  it('ends the walk on an empty or missing page', async () => {
    for (const data of [[], null]) {
      const result = await listItemsForExport(
        { categoryId: 'cat-1', after: null, size: 2 },
        rawReturning({ data, error: null }),
      );
      expect(result).toEqual({ data: { items: [], next: null }, error: null });
    }
  });

  it('hands back an error with no partial page', async () => {
    const boom = { message: 'boom' };

    const result = await listItemsForExport(
      { categoryId: 'cat-1', after: null, size: 2 },
      rawReturning({ data: [link('1'), link('2')], error: boom }),
    );

    expect(result).toEqual({ data: null, error: boom });
  });
});

import { describe, expect, it } from 'vitest';

import {
  rawCountItems,
  rawListItemIds,
  rawListItemsByIds,
  rawSearchCategoryItems,
} from './itemPage';
import { likePatternFor, searchFilterFor } from './itemSearch';

// A PostgREST builder holds its URL and only hits the network when awaited.
describe('the queries behind the catalogue page', () => {
  type Request = { url: URL; method: string; headers: Headers };
  const requestOf = (builder: unknown) => builder as Request;
  const paramsOf = (builder: unknown) => requestOf(builder).url.searchParams;

  const idsQuery = (from = 0, to = 8) =>
    paramsOf(rawListItemIds({ categoryId: 'cat-1', from, to }));
  const byIdsRequest = () => requestOf(rawListItemsByIds({ ids: ['a', 'b'] }));
  const countRequest = (search: string) =>
    requestOf(rawCountItems({ categoryId: 'cat-1', search }));

  it('pages item_categories alone, asking only for the item ids', () => {
    const builder = requestOf(
      rawListItemIds({ categoryId: 'cat-1', from: 0, to: 8 }),
    );
    expect(builder.url.pathname).toMatch(/\/item_categories$/);
    expect(builder.method).toBe('GET');
    expect(idsQuery().get('select')).toBe('item_id');
  });

  it('narrows the id page by category as a plain column filter', () => {
    expect(idsQuery().get('category_id')).toBe('eq.cat-1');
  });

  it('orders the id page newest-first, the item id breaking ties', () => {
    expect(idsQuery().get('order')).toBe('created_at.desc,item_id.asc');
  });

  it('asks for exactly the page it is given', () => {
    const params = idsQuery(36, 44);
    expect(params.get('offset')).toBe('36');
    expect(params.get('limit')).toBe('9');
  });

  it("reads the page's entries from items by id, with their photographs", () => {
    const request = byIdsRequest();
    expect(request.url.pathname).toMatch(/\/items$/);
    expect(request.method).toBe('GET');
    expect(request.url.searchParams.get('id')).toBe('in.(a,b)');
    expect(request.url.searchParams.get('select')).toBe(
      'id,title,description,place,place_lat,place_lng,tags,images(id,item_id,path_full,path_thumb)',
    );
  });

  it("orders each entry's photographs oldest-first, id breaking ties", () => {
    expect(byIdsRequest().url.searchParams.get('images.order')).toBe(
      'created_at.asc,id.asc',
    );
  });

  it('carries an abort signal through to each cancellable query', () => {
    const controller = new AbortController();
    const { signal } = controller;
    const signalOf = (builder: unknown) =>
      (builder as { signal?: AbortSignal }).signal;

    expect(
      signalOf(rawListItemIds({ categoryId: 'cat-1', from: 0, to: 8, signal })),
    ).toBe(signal);
    expect(signalOf(rawListItemsByIds({ ids: ['a'], signal }))).toBe(signal);
    expect(
      signalOf(rawCountItems({ categoryId: 'cat-1', search: '', signal })),
    ).toBe(signal);
    expect(
      signalOf(rawCountItems({ categoryId: 'cat-1', search: 'coin', signal })),
    ).toBe(signal);
    expect(
      signalOf(
        rawSearchCategoryItems({
          categoryId: 'cat-1',
          likePattern: '%coin%',
          from: 0,
          to: 8,
          signal,
        }),
      ),
    ).toBe(signal);
  });

  it('leaves a query with nothing to cancel without a signal', () => {
    const signalOf = (builder: unknown) =>
      (builder as { signal?: AbortSignal }).signal;
    expect(
      signalOf(rawListItemIds({ categoryId: 'cat-1', from: 0, to: 8 })),
    ).toBeUndefined();
    expect(signalOf(rawListItemsByIds({ ids: ['a'] }))).toBeUndefined();
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
    const request = requestOf(
      rawSearchCategoryItems({
        categoryId: 'cat-1',
        likePattern: '%coin%',
        from: 0,
        to: 8,
      }),
    );
    expect(request.url.pathname).toMatch(/\/rpc\/search_category_items$/);
    expect(request.method).toBe('GET');
    const params = searchParamsOf('coin');
    expect(params.get('cat_id')).toBe('cat-1');
    expect(params.get('like_pattern')).toBe(likePatternFor('coin'));
    expect(params.get('page_from')).toBe('0');
    expect(params.get('page_to')).toBe('8');
  });

  it('counts item_categories alone, with no join to items, when there is no search filter', () => {
    const request = countRequest('');
    expect(request.url.searchParams.get('select')).toBe('item_id');
    expect(request.method).toBe('HEAD');
    expect(request.headers.get('Prefer')).toContain('count=exact');
  });

  it('narrows the count query by category the same way the page query is', () => {
    expect(countRequest('').url.searchParams.get('category_id')).toBe(
      'eq.cat-1',
    );
    // Still so once the search filter brings the items join back: a whole-table count is someone else's.
    expect(countRequest('coin').url.searchParams.get('category_id')).toBe(
      'eq.cat-1',
    );
  });

  it('brings the items join back into the count only once a search filter applies', () => {
    const request = countRequest('coin');
    expect(request.url.searchParams.get('select')).toBe(
      'items!inner(id,title,description,place,place_lat,place_lng,tags)',
    );
    expect(request.method).toBe('HEAD');
    expect(request.headers.get('Prefer')).toContain('count=exact');
    expect(request.url.searchParams.get('items.or')).toBe(
      `(${searchFilterFor('coin')})`,
    );
  });

  it('leaves the count query unfiltered for a search term below the minimum length', () => {
    expect(countRequest('ab').url.searchParams.get('select')).toBe('item_id');
  });
});

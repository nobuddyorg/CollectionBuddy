import { describe, expect, it } from 'vitest';

import {
  rawCountItems,
  rawListItemIds,
  rawListItemsByIds,
  rawSearchCategoryItems,
} from './itemPage';
import { likePatternFor } from './itemSearch';
import { paramsOf, requestOf } from './postgrestRequest.test-support';

describe('the queries behind the catalogue page', () => {
  const idsQuery = (from = 0, to = 8) =>
    paramsOf(rawListItemIds({ categoryId: 'cat-1', from, to }));
  const byIdsRequest = () => requestOf(rawListItemsByIds({ ids: ['a', 'b'] }));
  const countRequest = () => requestOf(rawCountItems({ categoryId: 'cat-1' }));

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

    expect(
      requestOf(rawListItemIds({ categoryId: 'cat-1', from: 0, to: 8, signal }))
        .signal,
    ).toBe(signal);
    expect(requestOf(rawListItemsByIds({ ids: ['a'], signal })).signal).toBe(
      signal,
    );
    expect(
      requestOf(rawCountItems({ categoryId: 'cat-1', signal })).signal,
    ).toBe(signal);
    expect(
      requestOf(
        rawSearchCategoryItems({
          categoryId: 'cat-1',
          likePattern: '%coin%',
          from: 0,
          to: 8,
          signal,
        }),
      ).signal,
    ).toBe(signal);
  });

  it('leaves a query with nothing to cancel without a signal', () => {
    expect(
      requestOf(rawListItemIds({ categoryId: 'cat-1', from: 0, to: 8 })).signal,
    ).toBeUndefined();
    expect(requestOf(rawListItemsByIds({ ids: ['a'] })).signal).toBeUndefined();
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

  it('counts item_categories alone, with no join to items', () => {
    const request = countRequest();
    expect(request.url.searchParams.get('select')).toBe('item_id');
    expect(request.method).toBe('HEAD');
    expect(request.headers.get('Prefer')).toContain('count=exact');
  });

  it('narrows the count query by category the same way the page query is', () => {
    expect(countRequest().url.searchParams.get('category_id')).toBe('eq.cat-1');
  });
});

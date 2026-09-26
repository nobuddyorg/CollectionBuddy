import { describe, expect, it } from 'vitest';

import {
  createItemsInCategory,
  deleteItem,
  rawListCategoryPlaces,
  rawUpdateItemsPlace,
  updateItem,
} from './items';
import { likePatternFor } from './itemSearch';

// A PostgREST builder holds its URL and only hits the network when awaited.
describe('the query behind the map', () => {
  const paramsOf = (builder: unknown) =>
    (builder as { url: URL }).url.searchParams;

  const mapQuery = (search: string) =>
    paramsOf(
      rawListCategoryPlaces({ categoryId: 'cat-1', search, from: 0, to: 999 }),
    );

  it('calls the grouped-places RPC as a GET, with the category and a raw LIKE pattern', () => {
    const params = mapQuery('coin');
    expect(params.get('cat_id')).toBe('cat-1');
    expect(params.get('like_pattern')).toBe('%coin%');
    const builder = rawListCategoryPlaces({
      categoryId: 'cat-1',
      search: 'coin',
      from: 0,
      to: 999,
    }) as unknown as {
      method: string;
      url: URL;
    };
    expect(builder.method).toBe('GET');
    // Naming the wrong function is a 404 at runtime and nothing at compile time.
    expect(builder.url.pathname).toMatch(/\/rpc\/list_category_places$/);
  });

  // PostgREST truncates an unranged function result at max_rows without an error.
  it('asks the grouped-places RPC for exactly the page it is given', () => {
    const params = paramsOf(
      rawListCategoryPlaces({
        categoryId: 'cat-1',
        search: '',
        from: 1000,
        to: 1999,
      }),
    );
    expect(params.get('offset')).toBe('1000');
    expect(params.get('limit')).toBe('1000');
  });

  it('carries an abort signal through, and leaves it off when none is given', () => {
    const controller = new AbortController();
    const signalOf = (signal?: AbortSignal) =>
      (
        rawListCategoryPlaces({
          categoryId: 'cat-1',
          search: 'coin',
          from: 0,
          to: 999,
          signal,
        }) as unknown as { signal?: AbortSignal }
      ).signal;

    expect(signalOf(controller.signal)).toBe(controller.signal);
    expect(signalOf()).toBeUndefined();
  });

  it('omits like_pattern rather than sending it as the literal text "null"', () => {
    expect(mapQuery('').has('like_pattern')).toBe(false);
    expect(mapQuery('ab').has('like_pattern')).toBe(false);
  });

  it('narrows the map by the same escaping and minimum length as the list', () => {
    expect(mapQuery('coin').get('like_pattern')).toBe(likePatternFor('coin'));
    expect(mapQuery('50%').get('like_pattern')).toBe(likePatternFor('50%'));
  });
});

// A PostgREST builder composes its request eagerly, so each write can be read back without a server.
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

  // One request is one transaction: an entry whose link fails is never left behind in no category.
  it('creates entries and their links through one RPC call, naming the category', () => {
    const request = requestOf(createItemsInCategory('cat-1', [fields]));

    expect(request.url.pathname).toMatch(/\/rpc\/create_items_in_category$/);
    expect(request.method).toBe('POST');
    expect(request.body).toEqual({
      target_category_id: 'cat-1',
      entries: [fields],
    });
  });

  // A client sending its own user_id would hand the row to whoever it named.
  it("sends an import batch with the caller's ids and timestamps, and never a user_id", () => {
    const rows = [
      { ...fields, id: 'a', created_at: '2026-01-01T00:00:00.000Z' },
      { ...fields, id: 'b', created_at: '2026-01-01T00:00:00.001Z' },
    ];
    const request = requestOf(createItemsInCategory('cat-1', rows));

    expect(request.body).toEqual({
      target_category_id: 'cat-1',
      entries: rows,
    });
  });

  it('updates exactly the named row and reads back every field the list shows', () => {
    const request = requestOf(updateItem('item-1', { title: 'Renamed' }));

    expect(request.url.pathname).toMatch(/\/items$/);
    expect(request.method).toBe('PATCH');
    expect(request.url.searchParams.get('id')).toBe('eq.item-1');
    expect(request.url.searchParams.get('select')).toBe(
      'id,title,description,place,place_lat,place_lng,tags',
    );
    expect(request.body).toEqual({ title: 'Renamed' });
    expect(request.headers.get('Accept')).toContain('pgrst.object');
  });

  it('writes one place over a whole chunk of ids in a single request', () => {
    const request = requestOf(
      rawUpdateItemsPlace(['a', 'b'], { place_lat: 1.5, place_lng: 2.5 }),
    );

    expect(request.url.pathname).toMatch(/\/items$/);
    expect(request.method).toBe('PATCH');
    expect(request.url.searchParams.get('id')).toBe('in.(a,b)');
    expect(request.body).toEqual({ place_lat: 1.5, place_lng: 2.5 });
  });

  // A bare .delete() reports an RLS refusal as `{ error: null }`; asking for the id back exposes it.
  it('deletes exactly the named row and asks for its id back', () => {
    const request = requestOf(deleteItem('item-1'));

    expect(request.url.pathname).toMatch(/\/items$/);
    expect(request.method).toBe('DELETE');
    expect(request.url.searchParams.get('id')).toBe('eq.item-1');
    expect(request.url.searchParams.get('select')).toBe('id');
    expect(request.headers.get('Accept')).toContain('pgrst.object');
  });
});

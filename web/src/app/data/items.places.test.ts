import { describe, expect, it, vi } from 'vitest';

import { listCategoryPlaces, updateItemsPlace } from './items';

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
    expect(rawList).toHaveBeenCalledWith({
      categoryId: 'cat-1',
      search: '',
      signal: undefined,
    });
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

  // `.in()` puts every id in the query string; thousands of ids would hit a URL length limit.
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

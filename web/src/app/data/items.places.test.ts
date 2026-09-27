import { describe, expect, it, vi } from 'vitest';

import { listCategoryPlaces, updateItemsPlace } from './items';

describe('listCategoryPlaces', () => {
  const place = (name: string) => ({
    place: name,
    place_lat: 50.7,
    place_lng: 7.1,
    titles: ['a'],
    ids: [],
  });
  const pageOf = (start: number, length: number) =>
    Array.from({ length }, (_, index) => place(`Place ${start + index}`));

  it('reads one page of 1,000 places, with the search and the signal, for a category under the row cap', async () => {
    const rows = [place('Bonn')];
    const rawList = vi.fn().mockResolvedValue({ data: rows, error: null });
    const controller = new AbortController();

    const { data, error } = await listCategoryPlaces(
      { categoryId: 'cat-1', search: 'coin', signal: controller.signal },
      rawList,
    );

    expect(error).toBeNull();
    expect(data).toEqual(rows);
    expect(rawList).toHaveBeenCalledTimes(1);
    expect(rawList).toHaveBeenCalledWith({
      categoryId: 'cat-1',
      search: 'coin',
      from: 0,
      to: 999,
      signal: controller.signal,
    });
  });

  // PostgREST's max_rows truncates a longer answer silently, so a full page means read on.
  it('pages past the row cap until a short page, joining every place in order', async () => {
    const first = pageOf(0, 1000);
    const second = pageOf(1000, 1);
    const rawList = vi
      .fn()
      .mockResolvedValueOnce({ data: first, error: null })
      .mockResolvedValueOnce({ data: second, error: null });

    const { data, error } = await listCategoryPlaces(
      { categoryId: 'cat-1', search: '' },
      rawList,
    );

    expect(error).toBeNull();
    expect(data).toEqual([...first, ...second]);
    expect(rawList).toHaveBeenCalledTimes(2);
    expect(rawList).toHaveBeenLastCalledWith(
      expect.objectContaining({ from: 1000, to: 1999 }),
    );
  });

  it('reports the error and no data when any page fails, never a partial map', async () => {
    const rawList = vi
      .fn()
      .mockResolvedValueOnce({ data: pageOf(0, 1000), error: null })
      .mockResolvedValueOnce({ data: null, error: new Error('rls') });

    const { data, error } = await listCategoryPlaces(
      { categoryId: 'cat-1', search: '' },
      rawList,
    );

    expect(data).toBeNull();
    expect(error).toBeInstanceOf(Error);
  });

  it('reports no places for a success response that carried none', async () => {
    const rawList = vi.fn().mockResolvedValue({ data: null, error: null });

    const { data, error } = await listCategoryPlaces(
      { categoryId: 'cat-1', search: '' },
      rawList,
    );

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});

describe('updateItemsPlace', () => {
  it('writes the payload in a single call for a list under the chunk size', async () => {
    const updatePage = vi.fn().mockResolvedValue({ error: null });

    const { error } = await updateItemsPlace(
      { ids: ['a', 'b'], payload: { place_lat: 50.7, place_lng: 7.1 } },
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

    const { error } = await updateItemsPlace({ ids, payload }, updatePage);

    expect(error).toBeNull();
    expect(updatePage).toHaveBeenCalledTimes(3);
    expect(updatePage).toHaveBeenNthCalledWith(1, ids.slice(0, 100), payload);
    expect(updatePage).toHaveBeenNthCalledWith(2, ids.slice(100, 200), payload);
    expect(updatePage).toHaveBeenNthCalledWith(3, ids.slice(200, 250), payload);
  });

  it('asks nothing more of a list that fills its last chunk exactly', async () => {
    const ids = Array.from({ length: 200 }, (_, i) => `id-${i}`);
    const updatePage = vi.fn().mockResolvedValue({ error: null });

    await updateItemsPlace(
      { ids, payload: { place_lat: 0, place_lng: 0 } },
      updatePage,
    );

    expect(updatePage).toHaveBeenCalledTimes(2);
  });

  it('stops on the first chunk that errors, without writing the rest', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
    const updatePage = vi
      .fn()
      .mockResolvedValueOnce({ error: new Error('boom') });

    const { error } = await updateItemsPlace(
      { ids, payload: { place_lat: 0, place_lng: 0 } },
      updatePage,
    );

    expect(error).toBeInstanceOf(Error);
    expect(updatePage).toHaveBeenCalledTimes(1);
  });
});

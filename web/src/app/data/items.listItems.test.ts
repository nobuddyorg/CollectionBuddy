import { describe, expect, it, vi } from 'vitest';

import { listItems } from './items';
import { likePatternFor } from './itemSearch';

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
      { rawList, rawCount },
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
      { rawList, rawCount },
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
      { rawList, rawCount },
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
      { rawList, rawCount },
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
      { rawList, rawCount },
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
      { rawList, rawCount, rawSearch },
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
      { rawSearch },
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
      { rawSearch },
    );

    expect(error).toBeNull();
    expect(count).toBe(0);
    expect(data).toEqual([]);
  });

  it('flattens to an empty page rather than crashing when a successful response carries no rows', async () => {
    const rawSearch = vi.fn().mockResolvedValue({ data: null, error: null });

    const { data, error, count } = await listItems(
      { categoryId: 'cat-1', search: 'coin', from: 0, to: 8 },
      { rawSearch },
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
      { rawSearch },
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
      { rawList, rawCount, rawSearch },
    );

    expect(rawSearch).not.toHaveBeenCalled();
    expect(rawList).toHaveBeenCalled();
    expect(rawCount).toHaveBeenCalled();
  });
});

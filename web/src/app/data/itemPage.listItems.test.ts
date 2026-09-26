import { describe, expect, it, vi } from 'vitest';

import { listItems } from './itemPage';
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
  function photo(id: string, itemId: string) {
    return {
      id,
      item_id: itemId,
      path_full: `u/${itemId}/${id}.webp`,
      path_thumb: null,
    };
  }
  // What the by-id read returns per entry: the item plus its photographs.
  function itemRow(id: string, images: unknown[] = []) {
    return { ...item(id), images };
  }
  function idsPage(...ids: string[]) {
    return vi.fn().mockResolvedValue({
      data: ids.map((id) => ({ item_id: id })),
      error: null,
    });
  }
  const params = { categoryId: 'cat-1', search: '', from: 0, to: 8 };

  it("pages the ids, then reads just that page's entries by id, combining them with the separate count", async () => {
    const rawIds = idsPage('a', 'b');
    const rawItems = vi.fn().mockResolvedValue({
      data: [itemRow('a'), itemRow('b')],
      error: null,
    });
    const rawCount = vi.fn().mockResolvedValue({ count: 2, error: null });
    const controller = new AbortController();

    const { data, error, count } = await listItems(
      { ...params, signal: controller.signal },
      { rawIds, rawItems, rawCount },
    );

    expect(error).toBeNull();
    expect(count).toBe(2);
    expect(data).toEqual([item('a'), item('b')]);
    expect(rawIds).toHaveBeenCalledWith({
      ...params,
      signal: controller.signal,
    });
    expect(rawCount).toHaveBeenCalledWith({
      ...params,
      signal: controller.signal,
    });
    expect(rawItems).toHaveBeenCalledWith({
      ids: ['a', 'b'],
      signal: controller.signal,
    });
  });

  it('keeps the id page order, whatever order the by-id read answers in', async () => {
    const rawIds = idsPage('c', 'a', 'b');
    const rawItems = vi.fn().mockResolvedValue({
      data: [itemRow('a'), itemRow('b'), itemRow('c')],
      error: null,
    });
    const rawCount = vi.fn().mockResolvedValue({ count: 3, error: null });

    const { data } = await listItems(params, { rawIds, rawItems, rawCount });

    expect(data).toEqual([item('c'), item('a'), item('b')]);
  });

  it('drops an entry deleted between the two reads rather than leaving a hole', async () => {
    const rawIds = idsPage('a', 'gone', 'b');
    const rawItems = vi.fn().mockResolvedValue({
      data: [itemRow('b'), itemRow('a')],
      error: null,
    });
    const rawCount = vi.fn().mockResolvedValue({ count: 3, error: null });

    const { data, error } = await listItems(params, {
      rawIds,
      rawItems,
      rawCount,
    });

    expect(error).toBeNull();
    expect(data).toEqual([item('a'), item('b')]);
  });

  it("hands back the page's photograph rows alongside its items, in item order", async () => {
    const rawIds = idsPage('a', 'b');
    const rawItems = vi.fn().mockResolvedValue({
      data: [
        itemRow('b', [photo('p3', 'b')]),
        itemRow('a', [photo('p1', 'a'), photo('p2', 'a')]),
      ],
      error: null,
    });
    const rawCount = vi.fn().mockResolvedValue({ count: 2, error: null });

    const { data, imageRows } = await listItems(params, {
      rawIds,
      rawItems,
      rawCount,
    });

    expect(data).toEqual([item('a'), item('b')]);
    expect(imageRows).toEqual([
      photo('p1', 'a'),
      photo('p2', 'a'),
      photo('p3', 'b'),
    ]);
  });

  it('returns no data and a null count when the id page errors, and reads no entries', async () => {
    const rawIds = vi
      .fn()
      .mockResolvedValue({ data: null, error: new Error('boom') });
    const rawItems = vi.fn();
    const rawCount = vi.fn().mockResolvedValue({ count: 5, error: null });

    const { data, error, count, imageRows } = await listItems(params, {
      rawIds,
      rawItems,
      rawCount,
    });

    expect(data).toBeNull();
    expect(error).toBeInstanceOf(Error);
    expect(count).toBeNull();
    expect(imageRows).toBeNull();
    expect(rawItems).not.toHaveBeenCalled();
  });

  it('returns no data and a null count when the count request errors, even though the page succeeded', async () => {
    const rawIds = idsPage('a');
    const rawItems = vi.fn();
    const rawCount = vi
      .fn()
      .mockResolvedValue({ count: null, error: new Error('boom') });

    const { data, error, count, imageRows } = await listItems(params, {
      rawIds,
      rawItems,
      rawCount,
    });

    expect(data).toBeNull();
    expect(error).toBeInstanceOf(Error);
    expect(count).toBeNull();
    expect(imageRows).toBeNull();
    expect(rawItems).not.toHaveBeenCalled();
  });

  it('returns no data and a null count when the by-id read errors', async () => {
    const rawIds = idsPage('a');
    const rawItems = vi
      .fn()
      .mockResolvedValue({ data: null, error: new Error('boom') });
    const rawCount = vi.fn().mockResolvedValue({ count: 1, error: null });

    const { data, error, count, imageRows } = await listItems(params, {
      rawIds,
      rawItems,
      rawCount,
    });

    expect(data).toBeNull();
    expect(error).toBeInstanceOf(Error);
    expect(count).toBeNull();
    expect(imageRows).toBeNull();
  });

  it('answers an empty page without a by-id read', async () => {
    const rawIds = idsPage();
    const rawItems = vi.fn();
    const rawCount = vi.fn().mockResolvedValue({ count: 0, error: null });

    const result = await listItems(params, { rawIds, rawItems, rawCount });

    expect(result).toEqual({ data: [], error: null, count: 0, imageRows: [] });
    expect(rawItems).not.toHaveBeenCalled();
  });

  it('flattens to an empty page rather than crashing when a successful id page carries no rows', async () => {
    const rawIds = vi.fn().mockResolvedValue({ data: null, error: null });
    const rawItems = vi.fn();
    const rawCount = vi.fn().mockResolvedValue({ count: 0, error: null });

    const { data, error, count } = await listItems(params, {
      rawIds,
      rawItems,
      rawCount,
    });

    expect(error).toBeNull();
    expect(count).toBe(0);
    expect(data).toEqual([]);
  });

  it('flattens to an empty page rather than crashing when a successful by-id read carries no rows', async () => {
    const rawIds = idsPage('a');
    const rawItems = vi.fn().mockResolvedValue({ data: null, error: null });
    const rawCount = vi.fn().mockResolvedValue({ count: 1, error: null });

    const { data, error, imageRows } = await listItems(params, {
      rawIds,
      rawItems,
      rawCount,
    });

    expect(error).toBeNull();
    expect(data).toEqual([]);
    expect(imageRows).toEqual([]);
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
    const rawIds = vi.fn();
    const rawCount = vi.fn();
    const rawSearch = vi
      .fn()
      .mockResolvedValue({ data: [searchRow('a', 1)], error: null });

    await listItems(
      { categoryId: 'cat-1', search: 'coin', from: 0, to: 8 },
      { rawIds, rawCount, rawSearch },
    );

    expect(rawIds).not.toHaveBeenCalled();
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
    const rawIds = vi.fn().mockResolvedValue({ data: [], error: null });
    const rawCount = vi.fn().mockResolvedValue({ count: 0, error: null });
    const rawSearch = vi.fn();

    await listItems(
      { categoryId: 'cat-1', search: 'ab', from: 0, to: 8 },
      { rawIds, rawCount, rawSearch },
    );

    expect(rawSearch).not.toHaveBeenCalled();
    expect(rawIds).toHaveBeenCalled();
    expect(rawCount).toHaveBeenCalled();
  });
});

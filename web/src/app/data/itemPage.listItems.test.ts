import { describe, expect, it, vi } from 'vitest';

import { listItems } from './itemPage';
import { likePatternFor } from './itemSearch';

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

describe('listItems', () => {
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

  it('counts a missing head count as zero', async () => {
    const rawIds = idsPage('a');
    const rawItems = vi.fn().mockResolvedValue({
      data: [itemRow('a')],
      error: null,
    });
    const rawCount = vi.fn().mockResolvedValue({ count: null, error: null });

    const { count } = await listItems(params, { rawIds, rawItems, rawCount });

    expect(count).toBe(0);
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
});

describe('listItems, once a search term earns a filter', () => {
  const searchRow = (
    id: string,
    totalCount: number,
    photoIds: string[] = [],
  ) => ({
    ...item(id),
    total_count: totalCount,
    images: photoIds.map((photoId) => photo(photoId, id)),
  });

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

  it('strips total_count and the photographs off each row and reads the exact total from it', async () => {
    const rawSearch = vi.fn().mockResolvedValue({
      data: [searchRow('a', 5, ['p1', 'p2']), searchRow('b', 5, ['p3'])],
      error: null,
    });

    const { data, error, count, imageRows } = await listItems(
      { categoryId: 'cat-1', search: 'coin', from: 0, to: 8 },
      { rawSearch },
    );

    expect(error).toBeNull();
    expect(count).toBe(5);
    // Every row's photographs, in page order, so the page needs no read of its own for them.
    expect(imageRows).toEqual([
      photo('p1', 'a'),
      photo('p2', 'a'),
      photo('p3', 'b'),
    ]);
    expect(data).toEqual([item('a'), item('b')]);
  });

  it('reports a count of zero rather than null when nothing matched', async () => {
    const rawSearch = vi.fn().mockResolvedValue({ data: [], error: null });

    const { data, error, count } = await listItems(
      { categoryId: 'cat-1', search: 'coin', from: 0, to: 8 },
      { rawSearch },
    );

    // The first page carries its own total, so an empty one needs no second request.
    expect(rawSearch).toHaveBeenCalledOnce();
    expect(error).toBeNull();
    expect(count).toBe(0);
    expect(data).toEqual([]);
  });

  it("reads a later page's total off its own first row, with no second request", async () => {
    const rawSearch = vi
      .fn()
      .mockResolvedValue({ data: [searchRow('j', 10)], error: null });

    const { count } = await listItems(
      { categoryId: 'cat-1', search: 'coin', from: 9, to: 17 },
      { rawSearch },
    );

    expect(rawSearch).toHaveBeenCalledOnce();
    expect(count).toBe(10);
  });

  // A page past the end has no row to carry total_count; a count of 0 there flashed "No results".
  it('asks the first row for the total when a later page comes back empty', async () => {
    const rawSearch = vi
      .fn()
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({
        data: [searchRow('a', 12, ['p1'])],
        error: null,
      });

    const { data, error, count, imageRows } = await listItems(
      { categoryId: 'cat-1', search: 'coin', from: 18, to: 26 },
      { rawSearch },
    );

    expect(rawSearch).toHaveBeenCalledTimes(2);
    expect(rawSearch).toHaveBeenLastCalledWith({
      categoryId: 'cat-1',
      likePattern: likePatternFor('coin'),
      from: 0,
      to: 0,
      signal: undefined,
    });
    expect(error).toBeNull();
    expect(count).toBe(12);
    // Still the empty page it asked for, not the row that carried the total, nor its photographs.
    expect(data).toEqual([]);
    expect(imageRows).toEqual([]);
  });

  it('reports a count of zero when a later page is empty because nothing matches any more', async () => {
    const rawSearch = vi.fn().mockResolvedValue({ data: [], error: null });

    const { data, error, count } = await listItems(
      { categoryId: 'cat-1', search: 'coin', from: 9, to: 17 },
      { rawSearch },
    );

    expect(rawSearch).toHaveBeenCalledTimes(2);
    expect(error).toBeNull();
    expect(count).toBe(0);
    expect(data).toEqual([]);
  });

  it('returns no data and a null count when the request for the total errors', async () => {
    const rawSearch = vi
      .fn()
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: null, error: new Error('boom') });

    const { data, error, count } = await listItems(
      { categoryId: 'cat-1', search: 'coin', from: 9, to: 17 },
      { rawSearch },
    );

    expect(data).toBeNull();
    expect(error).toBeInstanceOf(Error);
    expect(count).toBeNull();
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

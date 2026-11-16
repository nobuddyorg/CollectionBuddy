import { describe, expect, it, vi } from 'vitest';

import {
  coverFirst,
  coversFirst,
  moveItemCover,
  rawReadItemCovers,
  readItemCovers,
  setItemCover,
} from './cover';
import { requestOf } from './postgrestRequest.test-support';

const photo = (id: string, itemId = 'item-1') => ({ id, item_id: itemId });

describe('coverFirst', () => {
  it('moves the chosen cover to the front, the rest keeping their order', () => {
    const photos = [photo('a'), photo('b'), photo('c')];
    expect(coverFirst(photos, 'c').map((row) => row.id)).toEqual([
      'c',
      'a',
      'b',
    ]);
    expect(coverFirst(photos, 'b').map((row) => row.id)).toEqual([
      'b',
      'a',
      'c',
    ]);
  });

  it('hands the same array back when nothing moves: no cover, a cover already first, or one that is gone', () => {
    const photos = [photo('a'), photo('b')];
    expect(coverFirst(photos, null)).toBe(photos);
    expect(coverFirst(photos, 'a')).toBe(photos);
    expect(coverFirst(photos, 'deleted')).toBe(photos);
    expect(coverFirst([], 'a')).toEqual([]);
  });
});

describe('coversFirst', () => {
  it('puts each entry’s cover first, grouping the photos by entry in the order they come', () => {
    const rows = [
      photo('a1', 'a'),
      photo('b1', 'b'),
      photo('a2', 'a'),
      photo('b2', 'b'),
    ];

    const ordered = coversFirst(rows, [
      { id: 'a', cover_image_id: 'a2' },
      { id: 'b', cover_image_id: null },
    ]);

    expect(ordered.map((row) => row.id)).toEqual(['a2', 'a1', 'b1', 'b2']);
  });

  it('leaves an entry whose cover was not read in its order', () => {
    const rows = [photo('a1', 'a'), photo('a2', 'a')];
    expect(coversFirst(rows, []).map((row) => row.id)).toEqual(['a1', 'a2']);
  });
});

describe('rawReadItemCovers', () => {
  it('reads just the id and cover of the entries asked for, from items', () => {
    const request = requestOf(rawReadItemCovers(['a', 'b']));
    expect(request.url.pathname).toMatch(/\/items$/);
    expect(request.method).toBe('GET');
    expect(request.url.searchParams.get('select')).toBe('id,cover_image_id');
    expect(request.url.searchParams.get('id')).toBe('in.(a,b)');
  });
});

describe('readItemCovers', () => {
  it('reads the covers a chunk of ids at a time and hands them back together', async () => {
    const ids = Array.from({ length: 150 }, (_, index) => `item-${index}`);
    const rawRead = vi.fn(async (chunk: string[]) => ({
      data: [{ id: chunk[0], cover_image_id: null }],
      error: null,
    })) as unknown as typeof rawReadItemCovers;

    const { data, error } = await readItemCovers(ids, rawRead);

    expect(error).toBeNull();
    expect(rawRead).toHaveBeenCalledTimes(2);
    expect(data).toEqual([
      { id: 'item-0', cover_image_id: null },
      { id: 'item-100', cover_image_id: null },
    ]);
  });

  it('hands the error back when a read fails', async () => {
    const boom = new Error('boom');
    const rawRead = vi.fn(async () => ({
      data: null,
      error: boom,
    })) as unknown as typeof rawReadItemCovers;

    expect(await readItemCovers(['a'], rawRead)).toEqual({
      data: null,
      error: boom,
    });
  });
});

describe('setItemCover', () => {
  it('names the photo as the entry’s cover, failing on an update RLS refused', () => {
    const request = requestOf(setItemCover({ itemId: 'item-1', imageId: 'b' }));
    expect(request.url.pathname).toMatch(/\/items$/);
    expect(request.method).toBe('PATCH');
    expect(request.url.searchParams.get('id')).toBe('eq.item-1');
    expect(request.url.searchParams.get('select')).toBe('id');
    expect(request.body).toEqual({ cover_image_id: 'b' });
    expect(request.headers.get('Accept')).toContain('pgrst.object');
  });
});

describe('moveItemCover', () => {
  it('hands the cover on only where the replaced photo was it', () => {
    const request = requestOf(
      moveItemCover({ itemId: 'item-1', from: 'old', to: 'new' }),
    );
    expect(request.method).toBe('PATCH');
    expect(request.url.searchParams.get('id')).toBe('eq.item-1');
    expect(request.url.searchParams.get('cover_image_id')).toBe('eq.old');
    expect(request.body).toEqual({ cover_image_id: 'new' });
  });
});

import { describe, expect, it, vi } from 'vitest';

import { supabase } from '../supabase';
import {
  ITEM_IMAGES_BUCKET,
  createImageRow,
  createSignedUrls,
  deleteImageRow,
  imagePrefix,
  listExportImagesForItems,
  listImagePathsForItems,
  listImagesForItems,
  removeImageObjects,
  uploadImageObject,
} from './images';

describe('imagePrefix', () => {
  it('joins the owning user and item id with a slash', () => {
    expect(imagePrefix('uid-1', 'item-1')).toBe('uid-1/item-1');
  });
});

function mockStorageFrom() {
  const api = {
    createSignedUrls: vi.fn(),
    upload: vi.fn(),
    remove: vi.fn(),
  };
  const from = vi
    .spyOn(supabase.storage, 'from')
    .mockReturnValue(
      api as unknown as ReturnType<typeof supabase.storage.from>,
    );
  return { from, ...api };
}

describe('createSignedUrls', () => {
  it('signs against the item-images bucket, defaulting to a one hour expiry', () => {
    const { from, createSignedUrls: signFn } = mockStorageFrom();
    void createSignedUrls(['uid/item/1.webp', 'uid/item/2.webp']);
    expect(from).toHaveBeenCalledWith(ITEM_IMAGES_BUCKET);
    expect(signFn).toHaveBeenCalledWith(
      ['uid/item/1.webp', 'uid/item/2.webp'],
      3600,
    );
  });

  it('carries a custom expiry through unchanged', () => {
    const { createSignedUrls: signFn } = mockStorageFrom();
    void createSignedUrls(['uid/item/1.webp'], 120);
    expect(signFn).toHaveBeenCalledWith(['uid/item/1.webp'], 120);
  });
});

describe('uploadImageObject', () => {
  it('uploads the given blob at the given path in the item-images bucket', () => {
    const { from, upload } = mockStorageFrom();
    const file = new Blob(['x']);
    void uploadImageObject('uid/item/1.webp', file);
    expect(from).toHaveBeenCalledWith(ITEM_IMAGES_BUCKET);
    expect(upload).toHaveBeenCalledWith('uid/item/1.webp', file);
  });
});

describe('removeImageObjects', () => {
  it('removes exactly the given paths from the item-images bucket', () => {
    const { from, remove } = mockStorageFrom();
    void removeImageObjects(['uid/item/1.webp', 'uid/item/2.webp']);
    expect(from).toHaveBeenCalledWith(ITEM_IMAGES_BUCKET);
    expect(remove).toHaveBeenCalledWith(['uid/item/1.webp', 'uid/item/2.webp']);
  });
});

type Call = { method: string; args: unknown[] };

function mockTableFrom() {
  const calls: Call[] = [];
  const methods = ['select', 'insert', 'delete', 'eq', 'single'] as const;
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of methods) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  const from = vi.fn().mockReturnValue(builder);
  vi.spyOn(supabase, 'from').mockImplementation(from);
  return { from, calls };
}

describe('createImageRow', () => {
  it('inserts the given row and selects it back by its listing columns', () => {
    const { from, calls } = mockTableFrom();
    const row = {
      item_id: 'item-1',
      path_full: 'uid/item-1/1.webp',
      path_thumb: 'uid/item-1/1_thumb.webp',
      size_bytes: 1234,
    };
    createImageRow(row);
    expect(from).toHaveBeenCalledWith('images');
    expect(calls[0]).toEqual({ method: 'insert', args: [row] });
    expect(calls[1]).toEqual({
      method: 'select',
      args: ['id, item_id, path_full, path_thumb'],
    });
    expect(calls[2].method).toBe('single');
  });
});

describe('deleteImageRow', () => {
  it('deletes exactly the given row and returns its paths', () => {
    const { from, calls } = mockTableFrom();
    deleteImageRow('image-1');
    expect(from).toHaveBeenCalledWith('images');
    expect(calls[0].method).toBe('delete');
    expect(calls[1]).toEqual({ method: 'eq', args: ['id', 'image-1'] });
    expect(calls[2]).toEqual({
      method: 'select',
      args: ['path_full, path_thumb'],
    });
    expect(calls[3].method).toBe('single');
  });
});

type Row = { item_id: string; n: number };

// Records the `.in()` chunk and `.range()` window for every page of every
// chunk fetched, and lets the test script what each call resolves to --
// this is what exercises selectImagesForItems' chunk-then-page loop, which
// isn't exposed directly.
function mockImagesQuery(
  resolve: (
    chunk: string[],
    from: number,
    to: number,
  ) => {
    data: Row[] | null;
    error: unknown;
  },
) {
  const calls: { chunk: string[]; from: number; to: number }[] = [];
  let chunk: string[] = [];
  let range: [number, number] = [0, 0];
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  builder.select = () => builder;
  builder.in = (_col: unknown, ids: unknown) => {
    chunk = ids as string[];
    return builder;
  };
  builder.order = () => builder;
  builder.range = (from: unknown, to: unknown) => {
    range = [from as number, to as number];
    return builder;
  };
  builder.returns = () => {
    calls.push({ chunk, from: range[0], to: range[1] });
    return Promise.resolve(resolve(chunk, range[0], range[1]));
  };
  const from = vi.fn().mockReturnValue(builder);
  vi.spyOn(supabase, 'from').mockImplementation(from);
  return { from, calls };
}

describe('listImagesForItems', () => {
  it('selects the listing columns for a single page, single chunk', async () => {
    const { from, calls } = mockImagesQuery((chunk) => ({
      data: chunk.map((id, i) => ({ item_id: id, n: i })),
      error: null,
    }));
    const { data, error } = await listImagesForItems(['item-1']);
    expect(from).toHaveBeenCalledWith('images');
    expect(error).toBeNull();
    expect(data).toEqual([{ item_id: 'item-1', n: 0 }]);
    expect(calls).toEqual([{ chunk: ['item-1'], from: 0, to: 999 }]);
  });

  it('stops as soon as a page comes back empty', async () => {
    mockImagesQuery(() => ({ data: [], error: null }));
    const { data, error } = await listImagesForItems(['item-1']);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('returns the error and gives up as soon as a page fails', async () => {
    const boom = new Error('boom');
    mockImagesQuery(() => ({ data: null, error: boom }));
    const { data, error } = await listImagesForItems(['item-1']);
    expect(data).toBeNull();
    expect(error).toBe(boom);
  });

  it('splits more than 100 ids into chunks of 100', async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `item-${i}`);
    const { calls } = mockImagesQuery(() => ({ data: [], error: null }));
    await listImagesForItems(ids);
    expect(calls).toHaveLength(2);
    expect(calls[0].chunk).toHaveLength(100);
    expect(calls[1].chunk).toHaveLength(50);
    expect(calls[0].chunk[0]).toBe('item-0');
    expect(calls[1].chunk[0]).toBe('item-100');
  });

  it('keeps paging a chunk while a page comes back full', async () => {
    const fullPage = Array.from({ length: 1000 }, (_, i) => ({
      item_id: 'item-1',
      n: i,
    }));
    let call = 0;
    const { calls } = mockImagesQuery(() => {
      call += 1;
      return call === 1
        ? { data: fullPage, error: null }
        : { data: [{ item_id: 'item-1', n: 1000 }], error: null };
    });
    const { data, error } = await listImagesForItems(['item-1']);
    expect(error).toBeNull();
    expect(data).toHaveLength(1001);
    expect(calls.map((c) => [c.from, c.to])).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });
});

describe('listImagePathsForItems', () => {
  it('selects path columns without the row id', async () => {
    const { calls } = mockImagesQuery(() => ({ data: [], error: null }));
    await listImagePathsForItems(['item-1']);
    expect(calls).toEqual([{ chunk: ['item-1'], from: 0, to: 999 }]);
  });
});

describe('listExportImagesForItems', () => {
  it('selects export columns without path_thumb', async () => {
    const { calls } = mockImagesQuery(() => ({ data: [], error: null }));
    await listExportImagesForItems(['item-1']);
    expect(calls).toEqual([{ chunk: ['item-1'], from: 0, to: 999 }]);
  });
});

import { describe, expect, it, vi } from 'vitest';

import { supabase } from '../supabase';
import {
  ITEM_IMAGES_BUCKET,
  createImageRow,
  createSignedUrls,
  deleteImageRow,
  imagePrefix,
  isTransientStorageError,
  listImagePathsForCategory,
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
    const { from, createSignedUrls: signUrls } = mockStorageFrom();
    void createSignedUrls(['uid/item/1.webp', 'uid/item/2.webp']);
    expect(ITEM_IMAGES_BUCKET).toBe('item-images');
    expect(from).toHaveBeenCalledWith('item-images');
    expect(signUrls).toHaveBeenCalledWith(
      ['uid/item/1.webp', 'uid/item/2.webp'],
      3600,
    );
  });

  it('carries a custom expiry through unchanged', () => {
    const { createSignedUrls: signUrls } = mockStorageFrom();
    void createSignedUrls(['uid/item/1.webp'], 120);
    expect(signUrls).toHaveBeenCalledWith(['uid/item/1.webp'], 120);
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
  // Scripts the image delete's answer and, when asked, whether its entry is still there.
  function answers(deleted: unknown, item?: unknown) {
    const calls: Record<string, Call[]> = { images: [], items: [] };
    vi.spyOn(supabase, 'from').mockImplementation(((table: string) => {
      const record =
        (method: string, answer?: unknown) =>
        (...args: unknown[]) => {
          calls[table].push({ method, args });
          return answer ?? builder;
        };
      const builder: Record<string, unknown> = {
        delete: record('delete'),
        eq: record('eq'),
        select: record('select', table === 'images' ? deleted : undefined),
        maybeSingle: record('maybeSingle', item),
      };
      return builder;
    }) as never);
    return calls;
  }

  const gone = { data: [], error: null };

  it('deletes exactly the given row and reads back what it deleted', async () => {
    const calls = answers({ data: [{ id: 'image-1' }], error: null });

    await expect(
      deleteImageRow({ id: 'image-1', itemId: 'item-1' }),
    ).resolves.toEqual({ error: null });
    expect(calls.images).toEqual([
      { method: 'delete', args: [] },
      { method: 'eq', args: ['id', 'image-1'] },
      { method: 'select', args: ['id'] },
    ]);
    expect(calls.items).toEqual([]);
  });

  it('passes a refused delete on without asking after the entry', async () => {
    const refused = { data: null, error: new Error('rls') };
    const calls = answers(refused);

    await expect(
      deleteImageRow({ id: 'image-1', itemId: 'item-1' }),
    ).resolves.toBe(refused);
    expect(calls.items).toEqual([]);
  });

  it("counts a row its entry's delete already took as deleted", async () => {
    const calls = answers(gone, { data: null, error: null });

    await expect(
      deleteImageRow({ id: 'image-1', itemId: 'item-1' }),
    ).resolves.toEqual({ error: null });
    expect(calls.items).toEqual([
      { method: 'select', args: ['id'] },
      { method: 'eq', args: ['id', 'item-1'] },
      { method: 'maybeSingle', args: [] },
    ]);
  });

  it('fails when no row was deleted while its entry is still there', async () => {
    answers(gone, { data: { id: 'item-1' }, error: null });

    const { error } = await deleteImageRow({ id: 'image-1', itemId: 'item-1' });

    expect(error).toEqual(new Error('Photograph image-1 was not deleted'));
  });

  it('fails when no row was deleted and the entry cannot be looked up', async () => {
    const lookup = { data: null, error: new Error('offline') };
    answers(gone, lookup);

    await expect(
      deleteImageRow({ id: 'image-1', itemId: 'item-1' }),
    ).resolves.toBe(lookup);
  });
});

type Row = { item_id: string; created_at: string; id: string };

type PageCall = {
  chunk: string[];
  gte: unknown[];
  or: unknown[];
  limit: unknown;
};

// Records each page's `.in()` chunk and keyset bounds, and scripts what each call resolves to.
function mockImagesQuery(
  resolve: (call: PageCall) => {
    data: Row[] | null;
    error: unknown;
  },
) {
  const calls: PageCall[] = [];
  const orders: unknown[][] = [];
  let columns = '';
  let call: PageCall;
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  builder.select = (select: unknown) => {
    columns = select as string;
    call = { chunk: [], gte: [], or: [], limit: undefined };
    return builder;
  };
  builder.in = (col: unknown, ids: unknown) => {
    orders.push(['in', col]);
    call.chunk = ids as string[];
    return builder;
  };
  builder.gte = (...args: unknown[]) => {
    call.gte = args;
    return builder;
  };
  builder.or = (...args: unknown[]) => {
    call.or = args;
    return builder;
  };
  builder.order = (...args: unknown[]) => {
    orders.push(args);
    return builder;
  };
  builder.limit = (limit: unknown) => {
    call.limit = limit;
    return builder;
  };
  builder.overrideTypes = () => {
    calls.push(call);
    return Promise.resolve(resolve(call));
  };
  const from = vi.fn().mockReturnValue(builder);
  vi.spyOn(supabase, 'from').mockImplementation(from);
  return { from, calls, orders, columns: () => columns };
}

const firstPage = (chunk: string[]) => ({
  chunk,
  gte: [],
  or: [],
  limit: 1000,
});

const photo = (itemId: string, n: number): Row => ({
  item_id: itemId,
  created_at: '2026-01-01T00:00:00+00:00',
  id: `photo-${String(n).padStart(4, '0')}`,
});

describe('listImagesForItems', () => {
  it('selects the listing columns, with the sort key, for a single page, single chunk', async () => {
    const { from, calls, columns } = mockImagesQuery((call) => ({
      data: call.or.length ? [] : [photo(call.chunk[0], 0)],
      error: null,
    }));
    const { data, error } = await listImagesForItems(['item-1']);
    expect(from).toHaveBeenCalledWith('images');
    expect(error).toBeNull();
    expect(data).toEqual([photo('item-1', 0)]);
    expect(calls).toEqual([firstPage(['item-1'])]);
    expect(columns()).toBe('id, item_id, path_full, path_thumb, created_at');
  });

  // Oldest first, id breaking a same-instant tie: this puts an item's first photograph in its hero slot.
  it('asks for the rows in the order the grid hangs them', async () => {
    const { orders } = mockImagesQuery(() => ({ data: [], error: null }));
    await listImagesForItems(['item-1']);
    expect(orders).toEqual([
      ['in', 'item_id'],
      ['created_at', { ascending: true }],
      ['id', { ascending: true }],
    ]);
  });

  it('stops as soon as a page comes back empty', async () => {
    const { calls } = mockImagesQuery(() => ({ data: [], error: null }));
    const { data, error } = await listImagesForItems(['item-1']);
    expect(error).toBeNull();
    expect(data).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  // A page with neither rows nor an error still ends the walk rather than being read for a length.
  it('stops on a page that answers with nothing at all', async () => {
    const { calls } = mockImagesQuery(() => ({ data: null, error: null }));
    const { data, error } = await listImagesForItems(['item-1']);
    expect(error).toBeNull();
    expect(data).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it('returns the error and gives up as soon as a page fails', async () => {
    const boom = new Error('boom');
    mockImagesQuery(() => ({ data: null, error: boom }));
    const { data, error } = await listImagesForItems(['item-1']);
    expect(data).toBeNull();
    expect(error).toBe(boom);
  });

  it('asks nothing more of a list that fills its last chunk exactly', async () => {
    const ids = Array.from({ length: 200 }, (_, i) => `item-${i}`);
    const { calls } = mockImagesQuery(() => ({ data: [], error: null }));
    await listImagesForItems(ids);
    expect(calls).toHaveLength(2);
  });

  it('splits more than 100 ids into chunks of 100', async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `item-${i}`);
    const { calls } = mockImagesQuery(() => ({ data: [], error: null }));
    await listImagesForItems(ids);
    // Exactly two, not a third empty one: the chunk walk stops at the last id, not one past it.
    expect(calls).toHaveLength(2);
    expect(calls[0].chunk).toHaveLength(100);
    expect(calls[1].chunk).toHaveLength(50);
    expect(calls[0].chunk[0]).toBe('item-0');
    expect(calls[1].chunk[0]).toBe('item-100');
  });

  it('starts the next page strictly after the last photograph read, with no offset', async () => {
    const full = Array.from({ length: 1000 }, (_, i) => photo('item-1', i));
    const pages = [full, [photo('item-1', 1000)]].values();
    const { calls } = mockImagesQuery(() => ({
      data: pages.next().value ?? [],
      error: null,
    }));
    const { data, error } = await listImagesForItems(['item-1']);
    expect(error).toBeNull();
    expect(data).toHaveLength(1001);
    const last = full[999];
    expect(calls).toEqual([
      firstPage(['item-1']),
      {
        chunk: ['item-1'],
        gte: ['created_at', last.created_at],
        or: [
          `created_at.gt."${last.created_at}",and(created_at.eq."${last.created_at}",id.gt."${last.id}")`,
        ],
        limit: 1000,
      },
    ]);
  });
});

type CategoryPageCall = { args: [string, unknown][]; limit: unknown };

// Records each page's filter chain, and scripts what each page resolves to.
function mockCategoryImagesQuery(
  resolve: (page: number) => { data: unknown[] | null; error: unknown },
) {
  const pages: CategoryPageCall[] = [];
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  let page: CategoryPageCall;
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      page.args.push([method, args]);
      return builder;
    };
  builder.select = (...args: unknown[]) => {
    page = { args: [['select', args]], limit: undefined };
    return builder;
  };
  builder.eq = record('eq');
  builder.gt = record('gt');
  builder.order = record('order');
  builder.limit = (limit: unknown) => {
    page.limit = limit;
    return builder;
  };
  builder.overrideTypes = () => {
    pages.push(page);
    return Promise.resolve(resolve(pages.length - 1));
  };
  const from = vi.fn().mockReturnValue(builder);
  vi.spyOn(supabase, 'from').mockImplementation(from);
  return { from, pages };
}

const categoryPhoto = (n: number) => ({
  id: `photo-${String(n).padStart(4, '0')}`,
  item_id: `item-${n}`,
  path_full: `uid/item-${n}/full.webp`,
  path_thumb: `uid/item-${n}/thumb.webp`,
});

describe('listImagePathsForCategory', () => {
  it("reads both paths of the category's photographs through the entry's link, in id order", async () => {
    const { from, pages } = mockCategoryImagesQuery(() => ({
      data: [categoryPhoto(1)],
      error: null,
    }));
    const { data, error } = await listImagePathsForCategory('cat-1');
    expect(from).toHaveBeenCalledWith('images');
    expect(error).toBeNull();
    expect(data).toEqual([categoryPhoto(1)]);
    expect(pages).toEqual([
      {
        args: [
          [
            'select',
            [
              'id, item_id, path_full, path_thumb, items!inner(item_categories!inner())',
            ],
          ],
          ['eq', ['items.item_categories.category_id', 'cat-1']],
          ['order', ['id']],
        ],
        limit: 1000,
      },
    ]);
  });

  it('starts the next page strictly after the last photograph read, with no offset', async () => {
    const full = Array.from({ length: 1000 }, (_, i) => categoryPhoto(i));
    const { pages } = mockCategoryImagesQuery((page) => ({
      data: page === 0 ? full : [categoryPhoto(1000)],
      error: null,
    }));
    const { data } = await listImagePathsForCategory('cat-1');
    expect(data).toHaveLength(1001);
    expect(pages).toHaveLength(2);
    expect(pages[1].args).toContainEqual(['gt', ['id', full[999].id]]);
    expect(pages[1].args.map(([method]) => method)).toEqual([
      'select',
      'eq',
      'gt',
      'order',
    ]);
  });

  // A partial list would read as "these are all its photographs", and the rest would outlive the delete.
  it('returns the error and no rows as soon as a page fails', async () => {
    const boom = new Error('boom');
    const { pages } = mockCategoryImagesQuery((page) =>
      page === 0
        ? {
            data: Array.from({ length: 1000 }, (_, i) => categoryPhoto(i)),
            error: null,
          }
        : { data: null, error: boom },
    );
    const { data, error } = await listImagePathsForCategory('cat-1');
    expect(data).toBeNull();
    expect(error).toBe(boom);
    expect(pages).toHaveLength(2);
  });
});

describe('isTransientStorageError', () => {
  // storage-js reports a request that never got an answer without any status.
  it('retries a failure that got no response at all', () => {
    expect(isTransientStorageError({})).toBe(true);
  });

  it('retries a rate limit and a server error, by HTTP status or by Storage code', () => {
    expect(isTransientStorageError({ status: 429, statusCode: '429' })).toBe(
      true,
    );
    expect(isTransientStorageError({ status: 500, statusCode: '500' })).toBe(
      true,
    );
    expect(
      isTransientStorageError({ status: 502, statusCode: 'Bad Gateway' }),
    ).toBe(true);
    expect(isTransientStorageError({ status: 400, statusCode: '503' })).toBe(
      true,
    );
  });

  // Storage answers a duplicate, an oversize file or a policy refusal with HTTP 400 and the real code in the body.
  it('gives up at once on a refusal no retry can change', () => {
    for (const statusCode of ['400', '403', '409', '413', '415']) {
      expect(isTransientStorageError({ status: 400, statusCode })).toBe(false);
    }
    expect(isTransientStorageError({ status: 403, statusCode: '403' })).toBe(
      false,
    );
    expect(
      isTransientStorageError({ status: 400, statusCode: 'InvalidRequest' }),
    ).toBe(false);
    expect(isTransientStorageError({ status: 400 })).toBe(false);
  });

  it('draws the line at 500, and counts only 429 among the 4xx', () => {
    expect(isTransientStorageError({ status: 499, statusCode: '499' })).toBe(
      false,
    );
    expect(isTransientStorageError({ status: 428, statusCode: '428' })).toBe(
      false,
    );
    expect(isTransientStorageError({ status: 430, statusCode: '430' })).toBe(
      false,
    );
  });
});

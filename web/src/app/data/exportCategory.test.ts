import { describe, expect, it, vi } from 'vitest';

import {
  ExportCancelledError,
  exportCategory,
  ITEM_PAGE_SIZE,
  LARGE_EXPORT_WARN_BYTES,
  PHOTO_DOWNLOAD_CONCURRENCY,
  PHOTO_FETCH_TIMEOUT_MS,
  SIGN_BATCH_SIZE,
  type ExportProgress,
  type ExportResult,
} from './exportCategory';
import { CSV_NAME, MANIFEST_NAME, type ExportManifest } from './exportFormat';
import type { ExportItem } from './exportFormat';
import * as zipModule from './zip';
import type { supabase } from '../supabase';

type GetSession = () => ReturnType<typeof supabase.auth.getSession>;
type ListItems = Parameters<typeof exportCategory>[0]['listItems'];
type ListImages = Parameters<typeof exportCategory>[0]['listImages'];
type SignUrls = Parameters<typeof exportCategory>[0]['signUrls'];

function item(overrides: Partial<ExportItem> = {}): ExportItem {
  return {
    id: 'item-1',
    title: 'Item',
    description: null,
    place: null,
    place_lat: null,
    place_lng: null,
    tags: [],
    created_at: '2026-01-02T03:04:05.000Z',
    ...overrides,
  };
}

// Only `data.session.user.id` is ever read, so that's all the fake carries.
function fakeGetSession(uid: string | null): GetSession {
  return (async () => ({
    data: { session: uid ? { user: { id: uid } } : null },
  })) as unknown as GetSession;
}

// Pages a fixed array the way PostgREST's own `.range(from, to)` would --
// inclusive of `to`, the boundary a page-size-off-by-one gets wrong.
function paginatedListItems(allItems: ExportItem[]): ListItems {
  return vi.fn(async (_categoryId: string, from: number, to: number) => ({
    data: allItems.slice(from, to + 1),
    error: null,
  })) as unknown as ListItems;
}

// Keyed by item id, building the same `uid/itemId/name` path shape a real
// row carries. `size_bytes: null`; tests that care about size use
// fakeListImagesWithSizes instead.
function fakeListImages(byItemId: Record<string, string[]>): ListImages {
  return async (itemIds: string[]) => ({
    data: itemIds.flatMap((itemId) =>
      (byItemId[itemId] ?? []).map((name) => ({
        item_id: itemId,
        path_full: `uid/${itemId}/${name}`,
        size_bytes: null,
      })),
    ),
    error: null,
  });
}

// Same shape, but each name carries the byte size the total-size check reads
// out of `size_bytes`.
function fakeListImagesWithSizes(
  byItemId: Record<string, { name: string; size: number }[]>,
): ListImages {
  return async (itemIds: string[]) => ({
    data: itemIds.flatMap((itemId) =>
      (byItemId[itemId] ?? []).map(({ name, size }) => ({
        item_id: itemId,
        path_full: `uid/${itemId}/${name}`,
        size_bytes: size,
      })),
    ),
    error: null,
  });
}

// Every path signs to a deterministic URL derived from itself, so a test
// can assert which photograph a fetch was for without extra state.
function fakeSignUrls(): SignUrls {
  return (async (paths: string[]) => ({
    data: paths.map((path) => ({ path, signedUrl: `signed://${path}` })),
    error: null,
  })) as unknown as SignUrls;
}

function okResponse(bytes: number[]): Response {
  return new Response(new Uint8Array(bytes));
}

function statusResponse(status: number): Response {
  return new Response(null, { status });
}

/** Reads a store-only ZIP back into its entries by walking the central
 * directory it wrote, rather than trusting the writer to have done what it
 * says. */
async function readZipEntries(blob: Blob): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = bytes.length - 22;
  const entryCount = dv.getUint16(eocd + 8, true);
  let directoryAt = dv.getUint32(eocd + 16, true);

  const entries = new Map<string, Uint8Array>();
  const decoder = new TextDecoder();
  for (let i = 0; i < entryCount; i++) {
    const size = dv.getUint32(directoryAt + 24, true);
    const nameLength = dv.getUint16(directoryAt + 28, true);
    const localOffset = dv.getUint32(directoryAt + 42, true);
    const name = decoder.decode(
      bytes.slice(directoryAt + 46, directoryAt + 46 + nameLength),
    );

    const localNameLength = dv.getUint16(localOffset + 26, true);
    const dataStart = localOffset + 30 + localNameLength;
    entries.set(name, bytes.slice(dataStart, dataStart + size));

    directoryAt += 46 + nameLength;
  }
  return entries;
}

// Derived from the result's own filename rather than recomputed from
// `now`/category name, since most tests below don't control `now`.
function rootFolderOf(result: ExportResult): string {
  return result.filename.replace(/\.zip$/, '');
}

async function manifestOf(result: ExportResult): Promise<ExportManifest> {
  const entries = await readZipEntries(result.blob);
  const bytes = entries.get(`${rootFolderOf(result)}/${MANIFEST_NAME}`);
  if (!bytes) throw new Error('collection.json missing from archive');
  return JSON.parse(new TextDecoder().decode(bytes)) as ExportManifest;
}

describe('exportCategory', () => {
  it('throws a named ExportError rather than exporting when there is no session', async () => {
    const failure = exportCategory({
      category: { id: 'cat', name: 'Coins' },
      getSession: fakeGetSession(null),
      listItems: paginatedListItems([]),
      listImages: fakeListImages({}),
      signUrls: fakeSignUrls(),
    });
    await expect(failure).rejects.toThrow('No user session');
    await expect(failure).rejects.toHaveProperty('name', 'ExportError');
  });

  it('throws when the item listing fails, rather than exporting an incomplete collection', async () => {
    const readError = { message: 'read failed' };
    const listItems = (async () => ({
      data: null,
      error: readError,
    })) as unknown as ListItems;
    const failure = exportCategory({
      category: { id: 'cat', name: 'Coins' },
      getSession: fakeGetSession('uid'),
      listItems,
      listImages: fakeListImages({}),
      signUrls: fakeSignUrls(),
    });
    await expect(failure).rejects.toThrow('Could not read items');
    await expect(failure).rejects.toHaveProperty('cause', readError);
  });

  it('throws when the photograph listing fails, rather than exporting an incomplete collection', async () => {
    const listingError = { message: 'read failed' };
    const listImages = (async () => ({
      data: null,
      error: listingError,
    })) as unknown as ListImages;
    const failure = exportCategory({
      category: { id: 'cat', name: 'Coins' },
      getSession: fakeGetSession('uid'),
      listItems: paginatedListItems([item({ id: 'a' })]),
      listImages,
      signUrls: fakeSignUrls(),
    });
    await expect(failure).rejects.toThrow('Could not list photographs');
    await expect(failure).rejects.toHaveProperty('cause', listingError);
  });

  it('stops paging rather than crashing when a page comes back with no data and no error', async () => {
    // Supabase's types allow `data: null, error: null` even though a real
    // empty page is `[]`.
    const listItems = (async () => ({
      data: null,
      error: null,
    })) as unknown as ListItems;
    const result = await exportCategory({
      category: { id: 'cat', name: 'Coins' },
      getSession: fakeGetSession('uid'),
      listItems,
      listImages: fakeListImages({}),
      signUrls: fakeSignUrls(),
    });
    expect(result.itemCount).toBe(0);
  });

  it('treats a null photograph listing the same as an empty one', async () => {
    const listImages = (async () => ({
      data: null,
      error: null,
    })) as unknown as ListImages;
    const result = await exportCategory({
      category: { id: 'cat', name: 'Coins' },
      getSession: fakeGetSession('uid'),
      listItems: paginatedListItems([item({ id: 'a' })]),
      listImages,
      signUrls: fakeSignUrls(),
    });
    expect(result.itemCount).toBe(1);
    expect(result.photoCount).toBe(0);
    expect(result.skippedPhotoCount).toBe(0);
  });

  it('treats a null signed-URL list the same as one with no rows, skipping every photograph it covered', async () => {
    const signUrls = (async () => ({
      data: null,
      error: null,
    })) as unknown as SignUrls;
    const result = await exportCategory({
      category: { id: 'cat', name: 'Coins' },
      getSession: fakeGetSession('uid'),
      listItems: paginatedListItems([item({ id: 'a' })]),
      listImages: fakeListImages({ a: ['1.webp'] }),
      signUrls,
    });
    expect(result.skippedPhotoCount).toBe(1);
    expect(result.photoCount).toBe(0);
  });

  it('throws when signing fails, rather than exporting with unreadable photo URLs', async () => {
    const signingError = { message: 'signing failed' };
    const signUrls = (async () => ({
      data: null,
      error: signingError,
    })) as unknown as SignUrls;
    const failure = exportCategory({
      category: { id: 'cat', name: 'Coins' },
      getSession: fakeGetSession('uid'),
      listItems: paginatedListItems([item({ id: 'a' })]),
      listImages: fakeListImages({ a: ['1.webp'] }),
      signUrls,
    });
    await expect(failure).rejects.toThrow('Could not sign photograph URLs');
    await expect(failure).rejects.toHaveProperty('cause', signingError);
  });

  it('signs in batches of SIGN_BATCH_SIZE, without an extra empty call at the boundary', async () => {
    const paths = Array.from(
      { length: SIGN_BATCH_SIZE + 50 },
      (_, i) => `uid/a/${i}.webp`,
    );
    const signUrls = vi.fn(async (batch: string[]) => ({
      data: batch.map((path) => ({ path, signedUrl: `signed://${path}` })),
      error: null,
    }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse([1])),
    );
    try {
      await exportCategory({
        category: { id: 'cat', name: 'Coins' },
        getSession: fakeGetSession('uid'),
        listItems: paginatedListItems([item({ id: 'a' })]),
        listImages: fakeListImages({
          a: paths.map((p) => p.split('/').at(-1)!),
        }),
        signUrls: signUrls as unknown as SignUrls,
      });

      // Two calls -- 100, then the 50 left over -- not three (an off-by-one
      // asking for an empty extra page) and not one (silently all at once).
      expect(signUrls).toHaveBeenCalledTimes(2);
      expect(signUrls.mock.calls[0][0]).toHaveLength(SIGN_BATCH_SIZE);
      expect(signUrls.mock.calls[1][0]).toHaveLength(50);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('does not ask for a trailing empty batch when the count is an exact multiple of SIGN_BATCH_SIZE', async () => {
    const paths = Array.from(
      { length: SIGN_BATCH_SIZE },
      (_, i) => `${i}.webp`,
    );
    const signUrls = vi.fn(async (batch: string[]) => ({
      data: batch.map((path) => ({ path, signedUrl: `signed://${path}` })),
      error: null,
    }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse([1])),
    );
    try {
      await exportCategory({
        category: { id: 'cat', name: 'Coins' },
        getSession: fakeGetSession('uid'),
        listItems: paginatedListItems([item({ id: 'a' })]),
        listImages: fakeListImages({ a: paths }),
        signUrls: signUrls as unknown as SignUrls,
      });
      // An off-by-one the other way (<=) would ask for a second, empty batch.
      expect(signUrls).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  describe('item pagination', () => {
    it('reads zero items in one call', async () => {
      const listItems = paginatedListItems([]);
      const result = await exportCategory({
        category: { id: 'cat', name: 'Coins' },
        getSession: fakeGetSession('uid'),
        listItems,
        listImages: fakeListImages({}),
        signUrls: fakeSignUrls(),
      });
      expect(result.itemCount).toBe(0);
      expect(listItems).toHaveBeenCalledOnce();
    });

    it('stops after one short page', async () => {
      const items = [item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })];
      const listItems = paginatedListItems(items);
      const result = await exportCategory({
        category: { id: 'cat', name: 'Coins' },
        getSession: fakeGetSession('uid'),
        listItems,
        listImages: fakeListImages({}),
        signUrls: fakeSignUrls(),
      });
      expect(result.itemCount).toBe(3);
      expect(listItems).toHaveBeenCalledOnce();
    });

    it('asks for a second, empty page when the first is exactly full, rather than stopping there', async () => {
      const items = Array.from({ length: ITEM_PAGE_SIZE }, (_, i) =>
        item({ id: `item-${i}` }),
      );
      const listItems = paginatedListItems(items);
      const result = await exportCategory({
        category: { id: 'cat', name: 'Coins' },
        getSession: fakeGetSession('uid'),
        listItems,
        listImages: fakeListImages({}),
        signUrls: fakeSignUrls(),
      });
      // Stopping on the first page would silently truncate any collection
      // whose size is an exact multiple of ITEM_PAGE_SIZE.
      expect(result.itemCount).toBe(ITEM_PAGE_SIZE);
      expect(listItems).toHaveBeenCalledTimes(2);
    });

    it('reads the item one past a full page', async () => {
      const items = Array.from({ length: ITEM_PAGE_SIZE + 1 }, (_, i) =>
        item({ id: `item-${i}` }),
      );
      const listItems = paginatedListItems(items);
      const result = await exportCategory({
        category: { id: 'cat', name: 'Coins' },
        getSession: fakeGetSession('uid'),
        listItems,
        listImages: fakeListImages({}),
        signUrls: fakeSignUrls(),
      });
      expect(result.itemCount).toBe(ITEM_PAGE_SIZE + 1);
      expect(listItems).toHaveBeenCalledTimes(2);
    });
  });

  describe('a photograph that cannot be fetched', () => {
    it('is left out of the archive but still named in the manifest, and the export still resolves', async () => {
      let permanentFailureCalls = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          // A 404 is permanent, so this resolves without needing fake timers.
          if (url === 'signed://uid/item-1/2.webp') {
            permanentFailureCalls++;
            return statusResponse(404);
          }
          return okResponse([1, 2, 3]);
        }),
      );
      try {
        const result = await exportCategory({
          category: { id: 'cat', name: 'Coins' },
          getSession: fakeGetSession('uid'),
          listItems: paginatedListItems([item({ id: 'item-1' })]),
          listImages: fakeListImages({
            'item-1': ['1.webp', '2.webp'],
          }),
          signUrls: fakeSignUrls(),
        });

        expect(result.skippedPhotoCount).toBe(1);
        expect(result.photoCount).toBe(1);
        expect(permanentFailureCalls).toBe(1);

        const entries = await readZipEntries(result.blob);
        const root = rootFolderOf(result);
        expect(entries.has(`${root}/photos/001-item/1.webp`)).toBe(true);
        expect(entries.get(`${root}/photos/001-item/1.webp`)).toEqual(
          new Uint8Array([1, 2, 3]),
        );
        expect(entries.has(`${root}/photos/001-item/2.webp`)).toBe(false);

        // The manifest still names the photograph the archive is missing.
        const manifest = await manifestOf(result);
        expect(manifest.items[0].photos).toEqual([
          'photos/001-item/1.webp',
          'photos/001-item/2.webp',
        ]);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('skips a photograph whose signing came back with no usable URL', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => okResponse([1])),
      );
      const signUrls = (async (paths: string[]) => ({
        data: paths.map((path, i) =>
          i === 0
            ? { path, signedUrl: null }
            : { path, signedUrl: `signed://${path}` },
        ),
        error: null,
      })) as unknown as SignUrls;
      try {
        const result = await exportCategory({
          category: { id: 'cat', name: 'Coins' },
          getSession: fakeGetSession('uid'),
          listItems: paginatedListItems([item({ id: 'item-1' })]),
          listImages: fakeListImages({
            'item-1': ['1.webp', '2.webp'],
          }),
          signUrls,
        });

        expect(result.skippedPhotoCount).toBe(1);
        expect(result.photoCount).toBe(1);
        const entries = await readZipEntries(result.blob);
        const root = rootFolderOf(result);
        expect(entries.has(`${root}/photos/001-item/1.webp`)).toBe(false);
        expect(entries.has(`${root}/photos/001-item/2.webp`)).toBe(true);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('retries a transient failure and includes the photograph once it succeeds', async () => {
      vi.useFakeTimers();
      let calls = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          calls++;
          // Retryable twice, then the request that should be kept.
          return calls < 3 ? statusResponse(503) : okResponse([9, 9]);
        }),
      );
      try {
        const promise = exportCategory({
          category: { id: 'cat', name: 'Coins' },
          getSession: fakeGetSession('uid'),
          listItems: paginatedListItems([item({ id: 'item-1' })]),
          listImages: fakeListImages({ 'item-1': ['1.webp'] }),
          signUrls: fakeSignUrls(),
        });
        // Two backoff waits stand between the first attempt and the third.
        await vi.advanceTimersByTimeAsync(10_000);
        const result = await promise;

        expect(calls).toBe(3);
        expect(result.skippedPhotoCount).toBe(0);
        const entries = await readZipEntries(result.blob);
        expect(
          entries.get(`${rootFolderOf(result)}/photos/001-item/1.webp`),
        ).toEqual(new Uint8Array([9, 9]));
      } finally {
        vi.useRealTimers();
        vi.unstubAllGlobals();
      }
    });

    it('gives up after exhausting every retry on a persistently retryable failure', async () => {
      vi.useFakeTimers();
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => statusResponse(503)),
      );
      try {
        const promise = exportCategory({
          category: { id: 'cat', name: 'Coins' },
          getSession: fakeGetSession('uid'),
          listItems: paginatedListItems([item({ id: 'item-1' })]),
          listImages: fakeListImages({ 'item-1': ['1.webp'] }),
          signUrls: fakeSignUrls(),
        });
        await vi.advanceTimersByTimeAsync(10_000);
        const result = await promise;

        expect(result.skippedPhotoCount).toBe(1);
        expect(result.photoCount).toBe(0);
        expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
      } finally {
        vi.useRealTimers();
        vi.unstubAllGlobals();
      }
    });

    it('retries a fetch that rejects outright, not just one that resolves with a bad status', async () => {
      vi.useFakeTimers();
      let calls = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          calls++;
          if (calls < 2) throw new TypeError('network error');
          return okResponse([4, 2]);
        }),
      );
      try {
        const promise = exportCategory({
          category: { id: 'cat', name: 'Coins' },
          getSession: fakeGetSession('uid'),
          listItems: paginatedListItems([item({ id: 'item-1' })]),
          listImages: fakeListImages({ 'item-1': ['1.webp'] }),
          signUrls: fakeSignUrls(),
        });
        await vi.advanceTimersByTimeAsync(10_000);
        const result = await promise;

        expect(calls).toBe(2);
        expect(result.skippedPhotoCount).toBe(0);
        const entries = await readZipEntries(result.blob);
        expect(
          entries.get(`${rootFolderOf(result)}/photos/001-item/1.webp`),
        ).toEqual(new Uint8Array([4, 2]));
      } finally {
        vi.useRealTimers();
        vi.unstubAllGlobals();
      }
    });
  });

  it('signs and fetches in batches larger than one page of items, and assembles a readable archive', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse([7])),
    );
    try {
      const items = [
        item({ id: 'a', title: 'Coin A' }),
        item({ id: 'b', title: 'Coin B' }),
      ];
      const now = () => new Date(2026, 0, 15, 12, 0, 0);
      const result = await exportCategory({
        category: { id: 'cat', name: 'Coins' },
        now,
        getSession: fakeGetSession('uid'),
        listItems: paginatedListItems(items),
        listImages: fakeListImages({
          a: ['1.webp'],
          b: ['1.webp'],
        }),
        signUrls: fakeSignUrls(),
      });

      expect(result.itemCount).toBe(2);
      expect(result.photoCount).toBe(2);
      expect(result.skippedPhotoCount).toBe(0);
      expect(result.filename).toBe('CollectionBuddy-coins-2026-01-15.zip');

      const entries = await readZipEntries(result.blob);
      const root = rootFolderOf(result);
      expect(root).toBe('CollectionBuddy-coins-2026-01-15');
      expect(entries.has(`${root}/${MANIFEST_NAME}`)).toBe(true);
      expect(entries.has(`${root}/${CSV_NAME}`)).toBe(true);
      expect(entries.has(`${root}/photos/001-coin-a/1.webp`)).toBe(true);
      expect(entries.has(`${root}/photos/002-coin-b/1.webp`)).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('wraps every entry -- manifest, spreadsheet and every photograph -- in one root folder', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse([1])),
    );
    try {
      const result = await exportCategory({
        category: { id: 'cat', name: 'Coins' },
        getSession: fakeGetSession('uid'),
        listItems: paginatedListItems([item({ id: 'a' })]),
        listImages: fakeListImages({ a: ['1.webp'] }),
        signUrls: fakeSignUrls(),
      });
      const entries = await readZipEntries(result.blob);
      const root = rootFolderOf(result);
      expect(entries.size).toBeGreaterThan(0);
      for (const name of entries.keys()) {
        expect(name.startsWith(`${root}/`)).toBe(true);
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('reports progress through each phase, counting each photograph as it lands', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse([1])),
    );
    try {
      const onProgress = vi.fn<(progress: ExportProgress) => void>();
      await exportCategory({
        category: { id: 'cat', name: 'Coins' },
        onProgress,
        getSession: fakeGetSession('uid'),
        listItems: paginatedListItems([item({ id: 'a' }), item({ id: 'b' })]),
        listImages: fakeListImages({
          a: ['1.webp'],
          b: ['1.webp'],
        }),
        signUrls: fakeSignUrls(),
      });

      // Exact sequence, not just membership: `done` counts up one at a time.
      expect(onProgress.mock.calls.map(([p]) => p)).toEqual([
        { phase: 'items', done: 0, total: 0 },
        { phase: 'photos', done: 0, total: 2 },
        { phase: 'photos', done: 1, total: 2 },
        { phase: 'photos', done: 2, total: 2 },
        { phase: 'packing', done: 2, total: 2 },
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('signs with a multi-hour TTL, so a slow download outlives the signed URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse([1])),
    );
    const signUrls = vi.fn(async (paths: string[]) => ({
      data: paths.map((path) => ({ path, signedUrl: `signed://${path}` })),
      error: null,
    }));
    try {
      await exportCategory({
        category: { id: 'cat', name: 'Coins' },
        getSession: fakeGetSession('uid'),
        listItems: paginatedListItems([item({ id: 'a' })]),
        listImages: fakeListImages({ a: ['1.webp'] }),
        signUrls: signUrls as unknown as SignUrls,
      });
      expect(signUrls).toHaveBeenCalledWith(expect.any(Array), 6 * 3600);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('logs which photograph it skipped and why', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => statusResponse(404)),
    );
    try {
      await exportCategory({
        category: { id: 'cat', name: 'Coins' },
        getSession: fakeGetSession('uid'),
        listItems: paginatedListItems([item({ id: 'item-1' })]),
        listImages: fakeListImages({ 'item-1': ['1.webp'] }),
        signUrls: fakeSignUrls(),
      });
      expect(consoleError).toHaveBeenCalledWith(
        'Skipping photograph',
        'uid/item-1/1.webp',
        expect.anything(),
      );
      const [, , err] = consoleError.mock.calls[0] as unknown[];
      expect(String(err)).toContain('HTTP 404');
    } finally {
      consoleError.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('names the exhausted status in the log once every retry is spent, not a blank message', async () => {
    vi.useFakeTimers();
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => statusResponse(503)),
    );
    try {
      const promise = exportCategory({
        category: { id: 'cat', name: 'Coins' },
        getSession: fakeGetSession('uid'),
        listItems: paginatedListItems([item({ id: 'item-1' })]),
        listImages: fakeListImages({ 'item-1': ['1.webp'] }),
        signUrls: fakeSignUrls(),
      });
      await vi.advanceTimersByTimeAsync(10_000);
      await promise;
      const [, , err] = consoleError.mock.calls[0] as unknown[];
      expect(String(err)).toContain('HTTP 503');
    } finally {
      vi.useRealTimers();
      consoleError.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('waits exponentially longer between retries, not a fixed or shrinking delay', async () => {
    vi.useFakeTimers();
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls++;
        return calls < 3 ? statusResponse(503) : okResponse([1]);
      }),
    );
    try {
      const promise = exportCategory({
        category: { id: 'cat', name: 'Coins' },
        getSession: fakeGetSession('uid'),
        listItems: paginatedListItems([item({ id: 'item-1' })]),
        listImages: fakeListImages({ 'item-1': ['1.webp'] }),
        signUrls: fakeSignUrls(),
      });

      // The first attempt is immediate.
      await vi.advanceTimersByTimeAsync(0);
      expect(calls).toBe(1);

      // The second waits PHOTO_RETRY_BASE_MS (500ms) -- not less, not more.
      await vi.advanceTimersByTimeAsync(499);
      expect(calls).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(calls).toBe(2);

      // The third waits twice that (1000ms): the backoff grows, it
      // doesn't repeat or shrink.
      await vi.advanceTimersByTimeAsync(999);
      expect(calls).toBe(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(calls).toBe(3);

      const result = await promise;
      expect(result.skippedPhotoCount).toBe(0);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  // The two edges isRetryableStatus draws, not the codes either side of them.
  it.each([429, 500])(
    'retries HTTP %i rather than treating it as permanent',
    async (status) => {
      vi.useFakeTimers();
      let calls = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          calls++;
          return calls < 2 ? statusResponse(status) : okResponse([1]);
        }),
      );
      try {
        const promise = exportCategory({
          category: { id: 'cat', name: 'Coins' },
          getSession: fakeGetSession('uid'),
          listItems: paginatedListItems([item({ id: 'item-1' })]),
          listImages: fakeListImages({ 'item-1': ['1.webp'] }),
          signUrls: fakeSignUrls(),
        });
        await vi.advanceTimersByTimeAsync(10_000);
        const result = await promise;
        expect(calls).toBe(2);
        expect(result.skippedPhotoCount).toBe(0);
      } finally {
        vi.useRealTimers();
        vi.unstubAllGlobals();
      }
    },
  );

  it('names the bucket in the error for a photograph with no signed URL at all', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const signUrls = (async () => ({
      data: null,
      error: null,
    })) as unknown as SignUrls;
    try {
      await exportCategory({
        category: { id: 'cat', name: 'Coins' },
        getSession: fakeGetSession('uid'),
        listItems: paginatedListItems([item({ id: 'item-1' })]),
        listImages: fakeListImages({ 'item-1': ['1.webp'] }),
        signUrls,
      });
      const [, , err] = consoleError.mock.calls[0] as unknown[];
      expect(String(err)).toContain('Unsigned path in');
    } finally {
      consoleError.mockRestore();
    }
  });

  // `createZipWriter` is not one of the raw calls this file accepts as a
  // parameter, so it's swapped out at the module level to force it to refuse.
  describe('a ZipLimitError from the writer', () => {
    it('escapes the export instead of being counted as a skipped photograph', async () => {
      const addSpy = vi.fn(() => {
        throw new zipModule.ZipLimitError(
          'Archive would exceed the 4 GiB ZIP limit',
        );
      });
      vi.spyOn(zipModule, 'createZipWriter').mockReturnValue({
        add: addSpy,
        size: () => 0,
        finish: vi.fn(),
      });
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => okResponse([1])),
      );
      try {
        const failure = exportCategory({
          category: { id: 'cat', name: 'Coins' },
          getSession: fakeGetSession('uid'),
          listItems: paginatedListItems([item({ id: 'item-1' })]),
          listImages: fakeListImages({ 'item-1': ['1.webp'] }),
          signUrls: fakeSignUrls(),
        });
        await expect(failure).rejects.toBeInstanceOf(zipModule.ZipLimitError);
      } finally {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
      }
    });

    it('stops the pool from starting further downloads once the limit trips', async () => {
      let addCalls = 0;
      const addSpy = vi.fn(() => {
        addCalls++;
        if (addCalls === 1) {
          throw new zipModule.ZipLimitError(
            'Archive would exceed the 4 GiB ZIP limit',
          );
        }
      });
      vi.spyOn(zipModule, 'createZipWriter').mockReturnValue({
        add: addSpy,
        size: () => 0,
        finish: vi.fn(),
      });
      let fetchCalls = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          fetchCalls++;
          return okResponse([1]);
        }),
      );
      try {
        // More photographs than the download pool runs at once, so a limit
        // tripped by the first one to finish can be observed stopping the
        // rest -- if it did not, every one of them would still be fetched.
        const photoCount = PHOTO_DOWNLOAD_CONCURRENCY + 4;
        const failure = exportCategory({
          category: { id: 'cat', name: 'Coins' },
          getSession: fakeGetSession('uid'),
          listItems: paginatedListItems([item({ id: 'item-1' })]),
          listImages: fakeListImages({
            'item-1': Array.from({ length: photoCount }, (_, i) => `${i}.webp`),
          }),
          signUrls: fakeSignUrls(),
        });
        await expect(failure).rejects.toBeInstanceOf(zipModule.ZipLimitError);
        expect(fetchCalls).toBeLessThan(photoCount);
      } finally {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
      }
    });

    // The error reported must be the one that happened first, not whichever
    // runner happens to reach the catch last.
    it('reports the first failure when more than one download fails around the same time', async () => {
      let addCalls = 0;
      const addSpy = vi.fn(() => {
        addCalls++;
        throw new zipModule.ZipLimitError(`limit-${addCalls}`);
      });
      vi.spyOn(zipModule, 'createZipWriter').mockReturnValue({
        add: addSpy,
        size: () => 0,
        finish: vi.fn(),
      });
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => okResponse([1])),
      );
      try {
        const failure = exportCategory({
          category: { id: 'cat', name: 'Coins' },
          getSession: fakeGetSession('uid'),
          listItems: paginatedListItems([item({ id: 'item-1' })]),
          listImages: fakeListImages({ 'item-1': ['0.webp', '1.webp'] }),
          signUrls: fakeSignUrls(),
        });
        await expect(failure).rejects.toHaveProperty('message', 'limit-1');
      } finally {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
      }
    });
  });

  describe('timeout and cancellation', () => {
    it('bounds every photograph fetch with a fresh per-attempt timeout signal', async () => {
      const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => okResponse([1])),
      );
      try {
        await exportCategory({
          category: { id: 'cat', name: 'Coins' },
          getSession: fakeGetSession('uid'),
          listItems: paginatedListItems([item({ id: 'item-1' })]),
          listImages: fakeListImages({ 'item-1': ['1.webp'] }),
          signUrls: fakeSignUrls(),
        });
        expect(timeoutSpy).toHaveBeenCalledWith(PHOTO_FETCH_TIMEOUT_MS);
      } finally {
        vi.unstubAllGlobals();
        timeoutSpy.mockRestore();
      }
    });

    // The signal handed to `fetch` must actually be linked to the caller's
    // own signal, not merely a timeout that looks the same.
    it('gives fetch a signal that reflects the caller aborting, not an inert one', async () => {
      const controller = new AbortController();
      let capturedSignal: AbortSignal | undefined;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_url: string, init?: RequestInit) => {
          capturedSignal = init?.signal ?? undefined;
          return okResponse([1]);
        }),
      );
      try {
        await exportCategory({
          category: { id: 'cat', name: 'Coins' },
          getSession: fakeGetSession('uid'),
          listItems: paginatedListItems([item({ id: 'item-1' })]),
          listImages: fakeListImages({ 'item-1': ['1.webp'] }),
          signUrls: fakeSignUrls(),
          signal: controller.signal,
        });
        expect(capturedSignal).toBeDefined();
        expect(capturedSignal!.aborted).toBe(false);
        controller.abort();
        expect(capturedSignal!.aborted).toBe(true);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('retries a fetch that aborts on its own timeout, the same as any other transient failure', async () => {
      vi.useFakeTimers();
      let calls = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          calls++;
          if (calls < 2) {
            throw new DOMException('The operation timed out.', 'TimeoutError');
          }
          return okResponse([9]);
        }),
      );
      try {
        const promise = exportCategory({
          category: { id: 'cat', name: 'Coins' },
          getSession: fakeGetSession('uid'),
          listItems: paginatedListItems([item({ id: 'item-1' })]),
          listImages: fakeListImages({ 'item-1': ['1.webp'] }),
          signUrls: fakeSignUrls(),
        });
        await vi.advanceTimersByTimeAsync(10_000);
        const result = await promise;
        expect(calls).toBe(2);
        expect(result.skippedPhotoCount).toBe(0);
      } finally {
        vi.useRealTimers();
        vi.unstubAllGlobals();
      }
    });

    it('rejects immediately with ExportCancelledError when the signal is already aborted, before any I/O', async () => {
      const controller = new AbortController();
      controller.abort();
      const listItems = vi.fn(paginatedListItems([item()]));
      const failure = exportCategory({
        category: { id: 'cat', name: 'Coins' },
        getSession: fakeGetSession('uid'),
        listItems,
        listImages: fakeListImages({}),
        signUrls: fakeSignUrls(),
        signal: controller.signal,
      });
      await expect(failure).rejects.toBeInstanceOf(ExportCancelledError);
      await expect(failure).rejects.toHaveProperty(
        'name',
        'ExportCancelledError',
      );
      await expect(failure).rejects.toHaveProperty(
        'message',
        'Export cancelled',
      );
      expect(listItems).not.toHaveBeenCalled();
    });

    it('stops fetching further photographs once the caller cancels mid-export', async () => {
      const controller = new AbortController();
      let fetchCalls = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          fetchCalls++;
          controller.abort();
          return okResponse([1]);
        }),
      );
      try {
        const items = Array.from({ length: 10 }, (_, i) =>
          item({ id: `item-${i}` }),
        );
        const listImages = fakeListImages(
          Object.fromEntries(items.map((it) => [it.id, ['1.webp']])),
        );
        const failure = exportCategory({
          category: { id: 'cat', name: 'Coins' },
          getSession: fakeGetSession('uid'),
          listItems: paginatedListItems(items),
          listImages,
          signUrls: fakeSignUrls(),
          signal: controller.signal,
        });
        await expect(failure).rejects.toBeInstanceOf(ExportCancelledError);
        expect(fetchCalls).toBeLessThan(items.length);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    // Without a check right after the failure that used up the last retry,
    // a cancellation landing there would fall through to `throw lastErr`
    // and surface as the network error instead of stopping the export.
    it('reports the cancellation itself, not the network error underneath it, when cancel lands on the last retry attempt', async () => {
      vi.useFakeTimers();
      const controller = new AbortController();
      let calls = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          calls++;
          if (calls === 3) controller.abort();
          throw new Error('network error');
        }),
      );
      try {
        const promise = exportCategory({
          category: { id: 'cat', name: 'Coins' },
          getSession: fakeGetSession('uid'),
          listItems: paginatedListItems([item({ id: 'item-1' })]),
          listImages: fakeListImages({ 'item-1': ['1.webp'] }),
          signUrls: fakeSignUrls(),
          signal: controller.signal,
        });
        // Attached before the timers advance: built afterwards, the handler
        // would attach one tick too late and Node would flag the rejection
        // as unhandled in between.
        const assertion =
          expect(promise).rejects.toBeInstanceOf(ExportCancelledError);
        await vi.advanceTimersByTimeAsync(10_000);
        await assertion;
        expect(calls).toBe(3);
      } finally {
        vi.useRealTimers();
        vi.unstubAllGlobals();
      }
    });
  });

  it('downloads photographs through a bounded pool, not one at a time or all at once', async () => {
    const photoCount = PHOTO_DOWNLOAD_CONCURRENCY + 4;
    let inFlight = 0;
    let maxInFlight = 0;
    const release: Array<() => void> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            inFlight++;
            maxInFlight = Math.max(maxInFlight, inFlight);
            release.push(() => {
              inFlight--;
              resolve(okResponse([1]));
            });
          }),
      ),
    );
    try {
      const promise = exportCategory({
        category: { id: 'cat', name: 'Coins' },
        getSession: fakeGetSession('uid'),
        listItems: paginatedListItems([item({ id: 'item-1' })]),
        listImages: fakeListImages({
          'item-1': Array.from({ length: photoCount }, (_, i) => `${i}.webp`),
        }),
        signUrls: fakeSignUrls(),
      });

      await vi.waitFor(() =>
        expect(release.length).toBe(PHOTO_DOWNLOAD_CONCURRENCY),
      );
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(maxInFlight).toBe(PHOTO_DOWNLOAD_CONCURRENCY);

      for (let released = 0; released < photoCount; released++) {
        await vi.waitFor(() => expect(release.length).toBeGreaterThan(0));
        release.shift()!();
      }

      const result = await promise;
      expect(result.photoCount).toBe(photoCount);
      expect(result.skippedPhotoCount).toBe(0);
      const entries = await readZipEntries(result.blob);
      const root = rootFolderOf(result);
      for (let i = 1; i <= photoCount; i++) {
        expect(entries.has(`${root}/photos/001-item/${i}.webp`)).toBe(true);
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('confirmLargeExport', () => {
  it('does not ask when the total stays under the threshold', async () => {
    const confirmLargeExport = vi.fn().mockResolvedValue(true);
    await exportCategory({
      category: { id: 'cat', name: 'Coins' },
      getSession: fakeGetSession('uid'),
      listItems: paginatedListItems([item({ id: 'a' })]),
      listImages: fakeListImagesWithSizes({
        a: [{ name: '1.webp', size: 1024 }],
      }),
      signUrls: fakeSignUrls(),
      confirmLargeExport,
    });
    expect(confirmLargeExport).not.toHaveBeenCalled();
  });

  it('asks, with the total bytes, once the threshold is exceeded, and proceeds when accepted', async () => {
    const bigSize = LARGE_EXPORT_WARN_BYTES + 1;
    const confirmLargeExport = vi.fn().mockResolvedValue(true);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse([1])),
    );
    try {
      const result = await exportCategory({
        category: { id: 'cat', name: 'Coins' },
        getSession: fakeGetSession('uid'),
        listItems: paginatedListItems([item({ id: 'a' })]),
        listImages: fakeListImagesWithSizes({
          a: [{ name: '1.webp', size: bigSize }],
        }),
        signUrls: fakeSignUrls(),
        confirmLargeExport,
      });
      expect(confirmLargeExport).toHaveBeenCalledWith(bigSize);
      expect(result.photoCount).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('cancels the export, before downloading anything, when the warning is declined', async () => {
    const bigSize = LARGE_EXPORT_WARN_BYTES + 1;
    const confirmLargeExport = vi.fn().mockResolvedValue(false);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    try {
      const failure = exportCategory({
        category: { id: 'cat', name: 'Coins' },
        getSession: fakeGetSession('uid'),
        listItems: paginatedListItems([item({ id: 'a' })]),
        listImages: fakeListImagesWithSizes({
          a: [{ name: '1.webp', size: bigSize }],
        }),
        signUrls: fakeSignUrls(),
        confirmLargeExport,
      });
      await expect(failure).rejects.toBeInstanceOf(ExportCancelledError);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('proceeds unprompted when no confirmLargeExport is supplied at all', async () => {
    const bigSize = LARGE_EXPORT_WARN_BYTES + 1;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse([1])),
    );
    try {
      const result = await exportCategory({
        category: { id: 'cat', name: 'Coins' },
        getSession: fakeGetSession('uid'),
        listItems: paginatedListItems([item({ id: 'a' })]),
        listImages: fakeListImagesWithSizes({
          a: [{ name: '1.webp', size: bigSize }],
        }),
        signUrls: fakeSignUrls(),
      });
      expect(result.photoCount).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('sums sizes across every item', async () => {
    const confirmLargeExport = vi.fn().mockResolvedValue(true);
    const half = LARGE_EXPORT_WARN_BYTES / 2 + 1;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse([1])),
    );
    try {
      await exportCategory({
        category: { id: 'cat', name: 'Coins' },
        getSession: fakeGetSession('uid'),
        listItems: paginatedListItems([item({ id: 'a' }), item({ id: 'b' })]),
        listImages: fakeListImagesWithSizes({
          a: [{ name: '1.webp', size: half }],
          b: [{ name: '1.webp', size: half }],
        }),
        signUrls: fakeSignUrls(),
        confirmLargeExport,
      });
      expect(confirmLargeExport).toHaveBeenCalledWith(2 * half);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

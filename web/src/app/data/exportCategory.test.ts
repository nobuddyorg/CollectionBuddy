import { describe, expect, it, vi } from 'vitest';

import {
  exportCategory,
  ITEM_PAGE_SIZE,
  SIGN_BATCH_SIZE,
  type ExportResult,
} from './exportCategory';
import { CSV_NAME, MANIFEST_NAME, type ExportManifest } from './exportFormat';
import type { ExportItem } from './exportFormat';
import type { supabase } from '../supabase';

// This is the file the review that opened #415 found completely untested:
// the pagination boundary, the batching, and the skip-on-failure/retry loop
// all lived behind a coverage-and-mutation exemption wide enough to hide a
// regression from every gate. getSession/listItems/listImages/signUrls are
// now parameters (exportCategory.ts does the same for `now`), so the four
// real calls this file makes can be replaced with fakes here instead of a
// database.

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

// Stands in for `supabase.auth.getSession()`. Only `data.session.user.id`
// is ever read, so that is all a fake has to carry.
function fakeGetSession(uid: string | null): GetSession {
  return (async () => ({
    data: { session: uid ? { user: { id: uid } } : null },
  })) as unknown as GetSession;
}

// Stands in for `listItemsForExport`, paging through a fixed array exactly
// as PostgREST's own `.range(from, to)` would -- inclusive of `to`, which
// is the boundary a page-size-off-by-one gets wrong.
function paginatedListItems(allItems: ExportItem[]): ListItems {
  return vi.fn(async (_categoryId: string, from: number, to: number) => ({
    data: allItems.slice(from, to + 1),
    error: null,
  })) as unknown as ListItems;
}

// Stands in for `listAllImageObjects`, keyed by the exact `${uid}/${itemId}`
// prefix exportCategory builds.
function fakeListImages(byPrefix: Record<string, string[]>): ListImages {
  return (async (prefix: string) => ({
    data: (byPrefix[prefix] ?? []).map((name) => ({ name })),
    error: null,
  })) as unknown as ListImages;
}

// Stands in for `createSignedUrls`: every path signs to a deterministic URL
// derived from itself, so a test can assert which photograph a fetch was
// for without threading extra state through.
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

/**
 * Reads a store-only ZIP (the only kind `./zip` ever writes) back into its
 * entries, by walking the central directory it did write rather than
 * assuming anything about the offsets it *should* have used -- this is what
 * gives the skip-path test below a real "is this photograph actually in the
 * archive" answer instead of trusting the writer to have done what it says.
 */
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

async function manifestOf(result: ExportResult): Promise<ExportManifest> {
  const entries = await readZipEntries(result.blob);
  const bytes = entries.get(MANIFEST_NAME);
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

  it('stops paging rather than crashing when a page comes back with no data and no error', async () => {
    // A defensive case Supabase's types allow (`data: null, error: null`)
    // even though a real empty page is `[]`: treated the same as an empty
    // page rather than spread into `items.push(...null)`.
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
      listImages: fakeListImages({ 'uid/a': ['1.webp'] }),
      signUrls,
    });
    expect(result.skippedPhotoCount).toBe(1);
    expect(result.photoCount).toBe(0);
  });

  it('throws when the photograph listing fails, rather than exporting a partial archive', async () => {
    const listingError = { message: 'listing failed' };
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
      listImages: fakeListImages({ 'uid/a': ['1.webp'] }),
      signUrls,
    });
    await expect(failure).rejects.toThrow('Could not sign photograph URLs');
    // The original PostgREST/storage error rides along as `cause`, not just
    // a rewritten message -- it's what a caller logging the failure needs.
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
          'uid/a': paths.map((p) => p.split('/').at(-1)!),
        }),
        signUrls: signUrls as unknown as SignUrls,
      });

      // Sliced into exactly two calls -- 100, then the 50 left over -- not
      // three (an off-by-one at the boundary asking for an empty extra
      // page) and not one (a slice that silently returned everything).
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
        listImages: fakeListImages({ 'uid/a': paths }),
        signUrls: signUrls as unknown as SignUrls,
      });
      // A count exactly at the boundary looks identical to one past it
      // until a second call proves there was nothing left to sign -- an
      // off-by-one the other way (<=) would ask for that second, empty
      // batch here.
      expect(signUrls).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  describe('item pagination', () => {
    // The four cases a range(from, to)-driven loop can get wrong: nothing
    // to page through, a short page that ends it immediately, a page
    // exactly at the size that must NOT be mistaken for the last one, and
    // one item past that boundary.
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
      // A page exactly ITEM_PAGE_SIZE long looks identical to a short page
      // until a second call proves there was nothing left -- stopping on
      // the first would silently truncate any collection whose size is a
      // multiple of ITEM_PAGE_SIZE.
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
          // A 404 is permanent -- no retry can fix it -- so this resolves
          // without the backoff delay real timers would otherwise need.
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
            'uid/item-1': ['1.webp', '2.webp'],
          }),
          signUrls: fakeSignUrls(),
        });

        expect(result.skippedPhotoCount).toBe(1);
        expect(result.photoCount).toBe(1);
        // A permanent failure is not retried: one call settles it, not the
        // three a retryable one gets.
        expect(permanentFailureCalls).toBe(1);

        const entries = await readZipEntries(result.blob);
        expect(entries.has('photos/001-item/1.webp')).toBe(true);
        expect(entries.get('photos/001-item/1.webp')).toEqual(
          new Uint8Array([1, 2, 3]),
        );
        expect(entries.has('photos/001-item/2.webp')).toBe(false);

        // The gap is visible, not silent: the manifest still names the
        // photograph the archive itself is missing.
        const manifest = await manifestOf(result);
        expect(manifest.items[0].photos).toEqual([
          'photos/001-item/1.webp',
          'photos/001-item/2.webp',
        ]);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    // createSignedUrls can come back with a row that names no usable URL
    // (Supabase drops it silently when signing that one object failed) --
    // signAll already skips such a row rather than storing an empty
    // string, and a photo whose path was never signed hits the same
    // "Unsigned path" guard a genuinely absent one would.
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
            'uid/item-1': ['1.webp', '2.webp'],
          }),
          signUrls,
        });

        expect(result.skippedPhotoCount).toBe(1);
        expect(result.photoCount).toBe(1);
        const entries = await readZipEntries(result.blob);
        expect(entries.has('photos/001-item/1.webp')).toBe(false);
        expect(entries.has('photos/001-item/2.webp')).toBe(true);
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
          listImages: fakeListImages({ 'uid/item-1': ['1.webp'] }),
          signUrls: fakeSignUrls(),
        });
        // Two backoff waits stand between the first attempt and the third.
        await vi.advanceTimersByTimeAsync(10_000);
        const result = await promise;

        expect(calls).toBe(3);
        expect(result.skippedPhotoCount).toBe(0);
        const entries = await readZipEntries(result.blob);
        expect(entries.get('photos/001-item/1.webp')).toEqual(
          new Uint8Array([9, 9]),
        );
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
          listImages: fakeListImages({ 'uid/item-1': ['1.webp'] }),
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

    // A rejected fetch() (offline, DNS failure, a dropped connection) is a
    // different failure shape from an HTTP error response -- no `status` to
    // read at all -- and retries the same way a 503 does.
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
          listImages: fakeListImages({ 'uid/item-1': ['1.webp'] }),
          signUrls: fakeSignUrls(),
        });
        await vi.advanceTimersByTimeAsync(10_000);
        const result = await promise;

        expect(calls).toBe(2);
        expect(result.skippedPhotoCount).toBe(0);
        const entries = await readZipEntries(result.blob);
        expect(entries.get('photos/001-item/1.webp')).toEqual(
          new Uint8Array([4, 2]),
        );
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
          'uid/a': ['1.webp'],
          'uid/b': ['1.webp'],
        }),
        signUrls: fakeSignUrls(),
      });

      expect(result.itemCount).toBe(2);
      expect(result.photoCount).toBe(2);
      expect(result.skippedPhotoCount).toBe(0);
      expect(result.filename).toBe('CollectionBuddy-coins-2026-01-15.zip');

      const entries = await readZipEntries(result.blob);
      expect(entries.has(MANIFEST_NAME)).toBe(true);
      expect(entries.has(CSV_NAME)).toBe(true);
      expect(entries.has('photos/001-coin-a/1.webp')).toBe(true);
      expect(entries.has('photos/002-coin-b/1.webp')).toBe(true);
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
      const onProgress = vi.fn();
      await exportCategory({
        category: { id: 'cat', name: 'Coins' },
        onProgress,
        getSession: fakeGetSession('uid'),
        listItems: paginatedListItems([item({ id: 'a' }), item({ id: 'b' })]),
        listImages: fakeListImages({
          'uid/a': ['1.webp'],
          'uid/b': ['1.webp'],
        }),
        signUrls: fakeSignUrls(),
      });

      // Exact sequence, not just membership: `done` has to count up from 0
      // to `total` one photograph at a time, not jump or run backwards.
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
        listImages: fakeListImages({ 'uid/a': ['1.webp'] }),
        signUrls: signUrls as unknown as SignUrls,
      });
      // 6 hours, not 6 seconds -- a large export on a slow connection can
      // easily outlive Supabase's own 1-hour default.
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
        listImages: fakeListImages({ 'uid/item-1': ['1.webp'] }),
        signUrls: fakeSignUrls(),
      });
      expect(consoleError).toHaveBeenCalledWith(
        'Skipping photograph',
        'uid/item-1/1.webp',
        expect.anything(),
      );
      // Names the HTTP status that caused it, not a blank message -- a
      // developer reading this log is the only diagnostic an export ever
      // gets, since the failure never reaches the UI beyond a count.
      const [, , err] = consoleError.mock.calls[0];
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
        listImages: fakeListImages({ 'uid/item-1': ['1.webp'] }),
        signUrls: fakeSignUrls(),
      });
      await vi.advanceTimersByTimeAsync(10_000);
      await promise;
      const [, , err] = consoleError.mock.calls[0];
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
        listImages: fakeListImages({ 'uid/item-1': ['1.webp'] }),
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

  // 429 (rate limited) and the 5xx boundary are the two edges
  // isRetryableStatus draws: not the status codes either side of them.
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
          listImages: fakeListImages({ 'uid/item-1': ['1.webp'] }),
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
        listImages: fakeListImages({ 'uid/item-1': ['1.webp'] }),
        signUrls,
      });
      const [, , err] = consoleError.mock.calls[0];
      expect(String(err)).toContain('Unsigned path in');
    } finally {
      consoleError.mockRestore();
    }
  });
});

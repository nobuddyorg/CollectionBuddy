import { describe, expect, it, vi } from 'vitest';

import { exportCategory, type ExportResult } from './exportCategory';
import type { ExportItem } from './exportFormat';
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

// Pages a fixed array by cursor as listItemsForExport does: a full page points at its last item.
function paginatedListItems(allItems: ExportItem[]): ListItems {
  return vi.fn(
    async (page: { after: { itemId: string } | null; size: number }) => {
      const start = page.after
        ? allItems.findIndex((entry) => entry.id === page.after!.itemId) + 1
        : 0;
      const items = allItems.slice(start, start + page.size);
      const next =
        items.length === page.size
          ? { linkedAt: 'at', itemId: items[items.length - 1].id }
          : null;
      return { data: { items, next }, error: null };
    },
  );
}

// Keyed by item id, building the `uid/itemId/name` path shape a real row carries; `size_bytes` null.
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

// Every path signs to a URL derived from itself, so a test can tell which photograph a fetch was for.
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

/** Reads a store-only ZIP back by walking its central directory, independently of the writer. */
async function readZipEntries(blob: Blob): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const dataView = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  );
  const trailerAt = bytes.length - 22;
  const entryCount = dataView.getUint16(trailerAt + 8, true);
  let directoryAt = dataView.getUint32(trailerAt + 16, true);

  const entries = new Map<string, Uint8Array>();
  const decoder = new TextDecoder();
  for (let i = 0; i < entryCount; i++) {
    const size = dataView.getUint32(directoryAt + 24, true);
    const nameLength = dataView.getUint16(directoryAt + 28, true);
    const localOffset = dataView.getUint32(directoryAt + 42, true);
    const name = decoder.decode(
      bytes.slice(directoryAt + 46, directoryAt + 46 + nameLength),
    );

    const localNameLength = dataView.getUint16(localOffset + 26, true);
    const dataStart = localOffset + 30 + localNameLength;
    entries.set(name, bytes.slice(dataStart, dataStart + size));

    directoryAt += 46 + nameLength;
  }
  return entries;
}

// Derived from the result's own filename, since most tests here don't control `now`.
function rootFolderOf(result: ExportResult): string {
  return result.filename.replace(/\.zip$/, '');
}

describe('exportCategory, retrying a photograph fetch', () => {
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
      const [, , error] = consoleError.mock.calls[0] as unknown[];
      expect(String(error)).toContain('HTTP 503');
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

      // The third waits twice that (1000ms): the backoff grows, it doesn't repeat or shrink.
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
});

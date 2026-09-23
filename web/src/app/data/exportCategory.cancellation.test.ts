import { describe, expect, it, vi } from 'vitest';

import {
  ExportCancelledError,
  exportCategory,
  PHOTO_FETCH_TIMEOUT_MS,
} from './exportCategory';
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

describe('exportCategory, timeout and cancellation', () => {
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

  // The signal handed to `fetch` must be linked to the caller's own, not merely a look-alike timeout.
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
    await expect(failure).rejects.toHaveProperty('message', 'Export cancelled');
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
        Object.fromEntries(items.map((entry) => [entry.id, ['1.webp']])),
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

  // Without a check after the last failed retry, a cancel landing there surfaces as the network error.
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
      // Attached before the timers advance, or Node flags the rejection as unhandled in between.
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

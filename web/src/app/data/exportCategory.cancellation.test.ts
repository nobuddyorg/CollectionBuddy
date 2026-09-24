import { describe, expect, it, vi } from 'vitest';

import {
  ExportCancelledError,
  exportCategory,
  PHOTO_FETCH_TIMEOUT_MS,
} from './exportCategory';
import {
  item,
  fakeGetSession,
  paginatedListItems,
  fakeListImages,
  fakeSignUrls,
  okResponse,
} from './exportCategory.test-support';

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

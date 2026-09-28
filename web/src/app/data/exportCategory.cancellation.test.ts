import { afterEach, describe, expect, it, vi } from 'vitest';

import { ExportCancelledError } from './exportCancellation';
import { exportCategory } from './exportCategory';
import { PHOTO_FETCH_TIMEOUT_MS } from './exportPhotos';
import {
  item,
  onePhotoExport,
  paginatedListItems,
  fakeSignUrls,
  okResponse,
} from './exportCategory.test-support';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('exportCategory, timeout and cancellation', () => {
  it('bounds every photograph fetch with a fresh per-attempt timeout signal', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse([1])),
    );
    await exportCategory(onePhotoExport());
    expect(timeoutSpy).toHaveBeenCalledWith(PHOTO_FETCH_TIMEOUT_MS);
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
    await exportCategory({ ...onePhotoExport(), signal: controller.signal });
    expect(capturedSignal).toBeDefined();
    expect(capturedSignal!.aborted).toBe(false);
    controller.abort();
    expect(capturedSignal!.aborted).toBe(true);
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
    const promise = exportCategory(onePhotoExport());
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await promise;
    expect(calls).toBe(2);
    expect(result.skippedPhotoCount).toBe(0);
  });

  it('rejects immediately with ExportCancelledError when the signal is already aborted, before any I/O', async () => {
    const controller = new AbortController();
    controller.abort();
    const listItems = vi.fn(paginatedListItems([item()]));
    const failure = exportCategory({
      category: { id: 'cat', name: 'Coins' },
      listItems,
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
    const items = Array.from({ length: 10 }, (_, i) =>
      item({ id: `item-${i}` }),
    );
    const photos = Object.fromEntries(
      items.map((entry) => [entry.id, ['1.webp']]),
    );
    const failure = exportCategory({
      category: { id: 'cat', name: 'Coins' },
      listItems: paginatedListItems(items, photos),
      signUrls: fakeSignUrls(),
      signal: controller.signal,
    });
    await expect(failure).rejects.toBeInstanceOf(ExportCancelledError);
    expect(fetchCalls).toBeLessThan(items.length);
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
    const promise = exportCategory({
      ...onePhotoExport(),
      signal: controller.signal,
    });
    // Attached before the timers advance, or Node flags the rejection as unhandled in between.
    const assertion =
      expect(promise).rejects.toBeInstanceOf(ExportCancelledError);
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(calls).toBe(3);
  });
});

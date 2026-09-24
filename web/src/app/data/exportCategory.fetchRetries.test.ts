import { describe, expect, it, vi } from 'vitest';

import { exportCategory } from './exportCategory';
import {
  item,
  fakeGetSession,
  paginatedListItems,
  fakeListImages,
  fakeSignUrls,
  okResponse,
  statusResponse,
  readZipEntries,
  rootFolderOf,
} from './exportCategory.test-support';

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

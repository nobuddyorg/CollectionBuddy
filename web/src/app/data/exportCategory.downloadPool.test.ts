import { describe, expect, it, vi } from 'vitest';

import { exportCategory, PHOTO_DOWNLOAD_CONCURRENCY } from './exportCategory';
import * as zipModule from './zip';
import {
  item,
  fakeGetSession,
  paginatedListItems,
  fakeListImages,
  fakeSignUrls,
  okResponse,
  readZipEntries,
  rootFolderOf,
} from './exportCategory.test-support';

describe('exportCategory, downloading through the pool', () => {
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

// `createZipWriter` is not an injected raw call, so it is swapped out at the module level to refuse.
describe('exportCategory, a ZipLimitError from the writer', () => {
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
      // More photographs than the pool runs at once, so a tripped limit can be seen stopping the rest.
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

  // The error reported must be the first to happen, not whichever runner reaches the catch last.
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

import { describe, expect, it, vi } from 'vitest';

import {
  ExportError,
  exportCategory,
  type ExportProgress,
} from './exportCategory';
import { CSV_NAME, MANIFEST_NAME } from './exportFormat';
import {
  type ListItems,
  type ListImages,
  type SignUrls,
  item,
  fakeGetSession,
  paginatedListItems,
  fakeListImages,
  fakeSignUrls,
  okResponse,
  readZipEntries,
  rootFolderOf,
} from './exportCategory.test-support';

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

  // No rows is `[]`; a null answer would ship an archive that looks like a collection without photos.
  it('fails the export rather than shipping an archive a null photograph listing emptied', async () => {
    const listImages = (async () => ({
      data: null,
      error: null,
    })) as unknown as ListImages;
    await expect(
      exportCategory({
        category: { id: 'cat', name: 'Coins' },
        getSession: fakeGetSession('uid'),
        listItems: paginatedListItems([item({ id: 'a' })]),
        listImages,
        signUrls: fakeSignUrls(),
      }),
    ).rejects.toThrow(ExportError);
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
      expect(onProgress.mock.calls.map(([progress]) => progress)).toEqual([
        { phase: 'items', done: 0, total: 0 },
        { phase: 'items', done: 2, total: 0 },
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
});

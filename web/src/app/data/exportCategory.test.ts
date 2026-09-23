import { describe, expect, it, vi } from 'vitest';

import {
  ExportError,
  exportCategory,
  type ExportProgress,
  type ExportResult,
} from './exportCategory';
import { CSV_NAME, MANIFEST_NAME, type ExportItem } from './exportFormat';
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

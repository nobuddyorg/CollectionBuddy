import { describe, expect, it, vi } from 'vitest';

import {
  exportCategory,
  PHOTO_DOWNLOAD_CONCURRENCY,
  type ExportResult,
} from './exportCategory';
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

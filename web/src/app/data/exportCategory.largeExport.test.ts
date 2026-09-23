import { describe, expect, it, vi } from 'vitest';

import {
  ExportCancelledError,
  exportCategory,
  LARGE_EXPORT_WARN_BYTES,
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

// Same shape, but each name carries the byte size the total-size check reads out of `size_bytes`.
function fakeListImagesWithSizes(
  byItemId: Record<string, { name: string; size: number }[]>,
): ListImages {
  return async (itemIds: string[]) => ({
    data: itemIds.flatMap((itemId) =>
      (byItemId[itemId] ?? []).map(({ name, size }) => ({
        item_id: itemId,
        path_full: `uid/${itemId}/${name}`,
        size_bytes: size,
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

describe('confirmLargeExport', () => {
  it('does not ask when the total stays under the threshold', async () => {
    const confirmLargeExport = vi.fn().mockResolvedValue(true);
    await exportCategory({
      category: { id: 'cat', name: 'Coins' },
      getSession: fakeGetSession('uid'),
      listItems: paginatedListItems([item({ id: 'a' })]),
      listImages: fakeListImagesWithSizes({
        a: [{ name: '1.webp', size: 1024 }],
      }),
      signUrls: fakeSignUrls(),
      confirmLargeExport,
    });
    expect(confirmLargeExport).not.toHaveBeenCalled();
  });

  // The check is a `>`: a total sitting exactly on the threshold is not a large export.
  it('does not ask for a total sitting exactly on the threshold', async () => {
    const confirmLargeExport = vi.fn().mockResolvedValue(true);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse([1])),
    );
    try {
      const result = await exportCategory({
        category: { id: 'cat', name: 'Coins' },
        getSession: fakeGetSession('uid'),
        listItems: paginatedListItems([item({ id: 'a' })]),
        listImages: fakeListImagesWithSizes({
          a: [{ name: '1.webp', size: LARGE_EXPORT_WARN_BYTES }],
        }),
        signUrls: fakeSignUrls(),
        confirmLargeExport,
      });
      expect(confirmLargeExport).not.toHaveBeenCalled();
      expect(result.photoCount).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('asks, with the total bytes, once the threshold is exceeded, and proceeds when accepted', async () => {
    const bigSize = LARGE_EXPORT_WARN_BYTES + 1;
    const confirmLargeExport = vi.fn().mockResolvedValue(true);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse([1])),
    );
    try {
      const result = await exportCategory({
        category: { id: 'cat', name: 'Coins' },
        getSession: fakeGetSession('uid'),
        listItems: paginatedListItems([item({ id: 'a' })]),
        listImages: fakeListImagesWithSizes({
          a: [{ name: '1.webp', size: bigSize }],
        }),
        signUrls: fakeSignUrls(),
        confirmLargeExport,
      });
      expect(confirmLargeExport).toHaveBeenCalledWith(bigSize);
      expect(result.photoCount).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('cancels the export, before downloading anything, when the warning is declined', async () => {
    const bigSize = LARGE_EXPORT_WARN_BYTES + 1;
    const confirmLargeExport = vi.fn().mockResolvedValue(false);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    try {
      const failure = exportCategory({
        category: { id: 'cat', name: 'Coins' },
        getSession: fakeGetSession('uid'),
        listItems: paginatedListItems([item({ id: 'a' })]),
        listImages: fakeListImagesWithSizes({
          a: [{ name: '1.webp', size: bigSize }],
        }),
        signUrls: fakeSignUrls(),
        confirmLargeExport,
      });
      await expect(failure).rejects.toBeInstanceOf(ExportCancelledError);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('proceeds unprompted when no confirmLargeExport is supplied at all', async () => {
    const bigSize = LARGE_EXPORT_WARN_BYTES + 1;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse([1])),
    );
    try {
      const result = await exportCategory({
        category: { id: 'cat', name: 'Coins' },
        getSession: fakeGetSession('uid'),
        listItems: paginatedListItems([item({ id: 'a' })]),
        listImages: fakeListImagesWithSizes({
          a: [{ name: '1.webp', size: bigSize }],
        }),
        signUrls: fakeSignUrls(),
      });
      expect(result.photoCount).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('sums sizes across every item', async () => {
    const confirmLargeExport = vi.fn().mockResolvedValue(true);
    const half = LARGE_EXPORT_WARN_BYTES / 2 + 1;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse([1])),
    );
    try {
      await exportCategory({
        category: { id: 'cat', name: 'Coins' },
        getSession: fakeGetSession('uid'),
        listItems: paginatedListItems([item({ id: 'a' }), item({ id: 'b' })]),
        listImages: fakeListImagesWithSizes({
          a: [{ name: '1.webp', size: half }],
          b: [{ name: '1.webp', size: half }],
        }),
        signUrls: fakeSignUrls(),
        confirmLargeExport,
      });
      expect(confirmLargeExport).toHaveBeenCalledWith(2 * half);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

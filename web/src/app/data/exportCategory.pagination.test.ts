import { describe, expect, it, vi } from 'vitest';

import {
  exportCategory,
  ITEM_PAGE_SIZE,
  type ExportProgress,
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

describe('exportCategory, paging through the items', () => {
  it('reads zero items in one call', async () => {
    const listItems = paginatedListItems([]);
    const result = await exportCategory({
      category: { id: 'cat', name: 'Coins' },
      getSession: fakeGetSession('uid'),
      listItems,
      listImages: fakeListImages({}),
      signUrls: fakeSignUrls(),
    });
    expect(result.itemCount).toBe(0);
    expect(listItems).toHaveBeenCalledOnce();
  });

  it('stops after one short page', async () => {
    const items = [item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })];
    const listItems = paginatedListItems(items);
    const result = await exportCategory({
      category: { id: 'cat', name: 'Coins' },
      getSession: fakeGetSession('uid'),
      listItems,
      listImages: fakeListImages({}),
      signUrls: fakeSignUrls(),
    });
    expect(result.itemCount).toBe(3);
    expect(listItems).toHaveBeenCalledOnce();
  });

  it('asks for a second, empty page when the first is exactly full, rather than stopping there', async () => {
    const items = Array.from({ length: ITEM_PAGE_SIZE }, (_, i) =>
      item({ id: `item-${i}` }),
    );
    const listItems = paginatedListItems(items);
    const result = await exportCategory({
      category: { id: 'cat', name: 'Coins' },
      getSession: fakeGetSession('uid'),
      listItems,
      listImages: fakeListImages({}),
      signUrls: fakeSignUrls(),
    });
    // Stopping on the first page would silently truncate a collection of exactly ITEM_PAGE_SIZE items.
    expect(result.itemCount).toBe(ITEM_PAGE_SIZE);
    expect(listItems).toHaveBeenCalledTimes(2);
  });

  it('reads the item one past a full page', async () => {
    const items = Array.from({ length: ITEM_PAGE_SIZE + 1 }, (_, i) =>
      item({ id: `item-${i}` }),
    );
    const listItems = paginatedListItems(items);
    const result = await exportCategory({
      category: { id: 'cat', name: 'Coins' },
      getSession: fakeGetSession('uid'),
      listItems,
      listImages: fakeListImages({}),
      signUrls: fakeSignUrls(),
    });
    expect(result.itemCount).toBe(ITEM_PAGE_SIZE + 1);
    expect(listItems).toHaveBeenCalledTimes(2);
  });

  it('starts each page after the last item of the one before', async () => {
    const items = Array.from({ length: ITEM_PAGE_SIZE + 1 }, (_, i) =>
      item({ id: `item-${i}` }),
    );
    const listItems = paginatedListItems(items);
    await exportCategory({
      category: { id: 'cat', name: 'Coins' },
      getSession: fakeGetSession('uid'),
      listItems,
      listImages: fakeListImages({}),
      signUrls: fakeSignUrls(),
    });
    expect(vi.mocked(listItems!).mock.calls).toEqual([
      [{ categoryId: 'cat', after: null, size: ITEM_PAGE_SIZE }],
      [
        {
          categoryId: 'cat',
          after: { linkedAt: 'at', itemId: `item-${ITEM_PAGE_SIZE - 1}` },
          size: ITEM_PAGE_SIZE,
        },
      ],
    ]);
  });

  it('reports the running item count after every page', async () => {
    const onProgress = vi.fn<(progress: ExportProgress) => void>();
    await exportCategory({
      category: { id: 'cat', name: 'Coins' },
      onProgress,
      getSession: fakeGetSession('uid'),
      listItems: paginatedListItems(
        Array.from({ length: ITEM_PAGE_SIZE + 1 }, (_, i) =>
          item({ id: `item-${i}` }),
        ),
      ),
      listImages: fakeListImages({}),
      signUrls: fakeSignUrls(),
    });
    expect(
      onProgress.mock.calls
        .map(([progress]) => progress)
        .filter((progress) => progress.phase === 'items'),
    ).toEqual([
      { phase: 'items', done: 0, total: 0 },
      { phase: 'items', done: ITEM_PAGE_SIZE, total: 0 },
      { phase: 'items', done: ITEM_PAGE_SIZE + 1, total: 0 },
    ]);
  });
});

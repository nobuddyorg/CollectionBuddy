import { describe, expect, it, vi } from 'vitest';

import {
  exportCategory,
  ITEM_PAGE_SIZE,
  type ExportProgress,
} from './exportCategory';
import {
  item,
  fakeGetSession,
  paginatedListItems,
  fakeListImages,
  fakeSignUrls,
} from './exportCategory.test-support';

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

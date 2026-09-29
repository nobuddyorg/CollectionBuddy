import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  exportCategory,
  ITEM_PAGE_SIZE,
  type ExportProgress,
} from './exportCategory';
import {
  item,
  paginatedListItems,
  fakeSignUrls,
  okResponse,
} from './exportCategory.test-support';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('exportCategory, paging through the items', () => {
  it('reads zero items in one call', async () => {
    const listItems = paginatedListItems([]);
    const result = await exportCategory({
      category: { id: 'cat', name: 'Coins' },
      listItems,
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
      listItems,
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
      listItems,
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
      listItems,
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
      listItems,
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

  it('gathers the photographs of every page, not only the first', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse([1])),
    );
    const items = Array.from({ length: ITEM_PAGE_SIZE + 1 }, (_, i) =>
      item({ id: `item-${i}` }),
    );
    const result = await exportCategory({
      category: { id: 'cat', name: 'Coins' },
      listItems: paginatedListItems(items, {
        'item-0': ['1.webp'],
        [`item-${ITEM_PAGE_SIZE}`]: ['1.webp', '2.webp'],
      }),
      signUrls: fakeSignUrls(),
    });
    expect(result.photoCount).toBe(3);
  });

  it('reports the running item count after every page', async () => {
    const onProgress = vi.fn<(progress: ExportProgress) => void>();
    await exportCategory({
      category: { id: 'cat', name: 'Coins' },
      onProgress,
      listItems: paginatedListItems(
        Array.from({ length: ITEM_PAGE_SIZE + 1 }, (_, i) =>
          item({ id: `item-${i}` }),
        ),
      ),
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

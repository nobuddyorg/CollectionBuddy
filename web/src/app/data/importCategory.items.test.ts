import { describe, expect, it, vi } from 'vitest';

import {
  importCategory,
  ITEM_INSERT_BATCH_SIZE,
  type ImportProgress,
} from './importCategory';
import {
  item,
  buildArchive,
  fakeCreateCategory,
  fakeCreateItems,
  NOW,
  baseFakes,
} from './importCategory.test-support';

describe('importCategory, recreating the items', () => {
  it('creates every manifest entry and its link to the new category in one request', async () => {
    const archive = await buildArchive({
      items: [
        item({ id: 'a', title: 'Dime' }),
        item({ id: 'b', title: 'Nickel' }),
      ],
      photosByItemId: {},
    });
    const createItemRows = fakeCreateItems();
    const createCategoryRow = fakeCreateCategory('new-cat-1');
    const result = await importCategory({
      file: archive,
      ...baseFakes(),
      createCategoryRow,
      createItemRows,
    });

    expect(createItemRows).toHaveBeenCalledOnce();
    expect(createItemRows).toHaveBeenCalledWith('new-cat-1', [
      {
        id: 'new-item-1',
        created_at: '2026-08-07T11:59:59.999Z',
        title: 'Dime',
        description: null,
        place: null,
        place_lat: null,
        place_lng: null,
        tags: [],
      },
      expect.objectContaining({
        id: 'new-item-2',
        created_at: '2026-08-07T12:00:00.000Z',
        title: 'Nickel',
      }),
    ]);
    expect(result.itemCount).toBe(2);
  });

  it('carries every manifest field over to the new row', async () => {
    const archive = await buildArchive({
      items: [
        item({
          id: 'a',
          title: 'Dime',
          description: 'Worn\nat the rim',
          place: 'Berlin',
          place_lat: 52.5,
          place_lng: 13.4,
          tags: ['silver'],
        }),
      ],
      photosByItemId: {},
    });
    const createItemRows = fakeCreateItems();
    await importCategory({
      file: archive,
      ...baseFakes(),
      createItemRows,
    });

    expect(createItemRows).toHaveBeenCalledWith('new-cat-1', [
      {
        id: 'new-item-1',
        created_at: NOW.toISOString(),
        title: 'Dime',
        description: 'Worn\nat the rim',
        place: 'Berlin',
        place_lat: 52.5,
        place_lng: 13.4,
        tags: ['silver'],
      },
    ]);
  });

  it('inserts ITEM_INSERT_BATCH_SIZE items per request, reporting progress per batch', async () => {
    const count = ITEM_INSERT_BATCH_SIZE + 1;
    const archive = await buildArchive({
      items: Array.from({ length: count }, (_, i) => item({ id: `o${i}` })),
      photosByItemId: {},
    });
    const createItemRows = fakeCreateItems();
    const onProgress = vi.fn<(progress: ImportProgress) => void>();
    await importCategory({
      file: archive,
      ...baseFakes(),
      createItemRows,
      onProgress,
    });

    expect(createItemRows.mock.calls.map(([, rows]) => rows.length)).toEqual([
      ITEM_INSERT_BATCH_SIZE,
      1,
    ]);
    expect(
      onProgress.mock.calls
        .map(([progress]) => progress)
        .filter((progress) => progress.phase === 'items'),
    ).toEqual([
      { phase: 'items', done: 0, total: count },
      { phase: 'items', done: ITEM_INSERT_BATCH_SIZE, total: count },
      { phase: 'items', done: count, total: count },
    ]);
  });
});

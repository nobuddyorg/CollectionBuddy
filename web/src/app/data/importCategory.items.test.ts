import { describe, expect, it, vi } from 'vitest';

import {
  importCategory,
  ITEM_INSERT_BATCH_SIZE,
  type ImportProgress,
} from './importCategory';
import {
  buildManifest,
  exportEntries,
  MANIFEST_NAME,
  type ExportItem,
} from './exportFormat';
import { createZipWriter } from './zip';

type ImportParams = Parameters<typeof importCategory>[0];
type GetUid = ImportParams['getUid'];
type CreateCategoryRow = ImportParams['createCategoryRow'];
type DeleteCategoryRow = ImportParams['deleteCategoryRow'];
type CreateItemRows = ImportParams['createItemRows'];
type LinkItemRows = ImportParams['linkItemRows'];
type DeleteItemRows = ImportParams['deleteItemRows'];
type UploadImage = ImportParams['uploadImage'];
type CreateImage = ImportParams['createImage'];
type CompressThumb = ImportParams['compressThumb'];

function item(overrides: Partial<ExportItem> = {}): ExportItem {
  return {
    id: 'orig-item-1',
    title: 'Seated Dime',
    description: null,
    place: null,
    place_lat: null,
    place_lng: null,
    tags: [],
    created_at: '2026-01-02T03:04:05.000Z',
    ...overrides,
  };
}

/** A real archive built the way exportCategory.ts does, so the import reads the actual format. */
async function buildArchive({
  items = [item()],
  photosByItemId = { 'orig-item-1': [new Uint8Array([1, 2, 3])] },
  root = 'CollectionBuddy-coins-2026-08-06',
}: {
  items?: ExportItem[];
  photosByItemId?: Record<string, Uint8Array<ArrayBuffer>[]>;
  root?: string;
} = {}): Promise<Blob> {
  const photoPathsByItemId = new Map(
    Object.entries(photosByItemId).map(([id, photos]) => [
      id,
      photos.map((_, i) => `${id}/${i}.webp`),
    ]),
  );
  const entries = exportEntries(items, photoPathsByItemId);
  const manifest = buildManifest({
    category: { id: 'orig-cat-1', name: 'Coins' },
    entries,
    exportedAt: new Date('2026-08-06T00:00:00.000Z'),
  });

  const writer = createZipWriter();
  const encoder = new TextEncoder();
  writer.add({
    path: `${root}/${MANIFEST_NAME}`,
    bytes: encoder.encode(JSON.stringify(manifest)),
  });
  for (const entry of entries) {
    for (const photo of entry.photos) {
      const [itemId, indexText] = photo.storagePath.split('/');
      const bytes =
        photosByItemId[itemId][Number(indexText.replace('.webp', ''))];
      writer.add({ path: `${root}/${photo.archivePath}`, bytes });
    }
  }
  return writer.finish();
}

function fakeGetUid(uid: string | null): GetUid {
  return async () => uid;
}

function fakeCreateCategory(id = 'new-cat-1'): CreateCategoryRow {
  return vi.fn(async (name: string) => ({
    data: { id, name },
    error: null,
  })) as unknown as CreateCategoryRow;
}

function fakeDeleteCategory(): DeleteCategoryRow {
  return vi.fn(async () => ({ error: null })) as unknown as DeleteCategoryRow;
}

function fakeCreateItems(): CreateItemRows {
  return vi.fn(async () => ({ error: null })) as unknown as CreateItemRows;
}

function fakeLinkItems(): LinkItemRows {
  return vi.fn(async () => ({ error: null })) as unknown as LinkItemRows;
}

function fakeDeleteItems(): DeleteItemRows {
  return vi.fn(async () => ({ error: null })) as unknown as DeleteItemRows;
}

// Sequential, so each new item's id is predictable: new-item-1, -2, ...
function fakeNewItemId(): () => string {
  let n = 0;
  return () => `new-item-${++n}`;
}

const NOW = new Date('2026-08-07T12:00:00.000Z');

function fakeUploadImage(): UploadImage {
  return vi.fn(async () => ({ error: null })) as unknown as UploadImage;
}

function fakeCreateImage(): CreateImage {
  return vi.fn(async () => ({
    data: { id: 'img-1', item_id: 'item', path_full: 'a', path_thumb: null },
    error: null,
  })) as unknown as CreateImage;
}

function fakeCompressThumb(): CompressThumb {
  return vi.fn(async () => new Blob(['thumb']));
}

function baseFakes() {
  return {
    getUid: fakeGetUid('uid'),
    createCategoryRow: fakeCreateCategory(),
    deleteCategoryRow: fakeDeleteCategory(),
    createItemRows: fakeCreateItems(),
    linkItemRows: fakeLinkItems(),
    deleteItemRows: fakeDeleteItems(),
    newItemId: fakeNewItemId(),
    now: () => NOW,
    uploadImage: fakeUploadImage(),
    createImage: fakeCreateImage(),
    compressThumb: fakeCompressThumb(),
  };
}

describe('importCategory, recreating the items', () => {
  it('creates every manifest entry in one insert, and links them all in one more', async () => {
    const archive = await buildArchive({
      items: [
        item({ id: 'a', title: 'Dime' }),
        item({ id: 'b', title: 'Nickel' }),
      ],
      photosByItemId: {},
    });
    const createItemRows = fakeCreateItems();
    const linkItemRows = fakeLinkItems();
    const createCategoryRow = fakeCreateCategory('new-cat-1');
    const result = await importCategory({
      file: archive,
      categoryName: 'Coins',
      ...baseFakes(),
      createCategoryRow,
      createItemRows,
      linkItemRows,
    });

    expect(createItemRows).toHaveBeenCalledOnce();
    expect(createItemRows).toHaveBeenCalledWith([
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
    expect(linkItemRows).toHaveBeenCalledOnce();
    expect(linkItemRows).toHaveBeenCalledWith([
      {
        item_id: 'new-item-1',
        category_id: 'new-cat-1',
        created_at: '2026-08-07T11:59:59.999Z',
      },
      {
        item_id: 'new-item-2',
        category_id: 'new-cat-1',
        created_at: '2026-08-07T12:00:00.000Z',
      },
    ]);
    expect(result.itemCount).toBe(2);
  });

  it('carries every manifest field over to the new row', async () => {
    const archive = await buildArchive({
      items: [
        item({
          id: 'a',
          title: 'Dime',
          description: 'Worn',
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
      categoryName: 'Coins',
      ...baseFakes(),
      createItemRows,
    });

    expect(createItemRows).toHaveBeenCalledWith([
      {
        id: 'new-item-1',
        created_at: NOW.toISOString(),
        title: 'Dime',
        description: 'Worn',
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
    const linkItemRows = fakeLinkItems();
    const onProgress = vi.fn<(progress: ImportProgress) => void>();
    await importCategory({
      file: archive,
      categoryName: 'Coins',
      ...baseFakes(),
      createItemRows,
      linkItemRows,
      onProgress,
    });

    const sizes = (mock: unknown) =>
      (mock as ReturnType<typeof vi.fn>).mock.calls.map(
        ([rows]) => (rows as unknown[]).length,
      );
    expect(sizes(createItemRows)).toEqual([ITEM_INSERT_BATCH_SIZE, 1]);
    expect(sizes(linkItemRows)).toEqual([ITEM_INSERT_BATCH_SIZE, 1]);
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

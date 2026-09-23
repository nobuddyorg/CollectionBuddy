import { describe, expect, it, vi } from 'vitest';

import {
  ImportCancelledError,
  importCategory,
  ITEM_INSERT_BATCH_SIZE,
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

describe('importCategory, cancelled', () => {
  it('rejects immediately with ImportCancelledError when the signal is already aborted', async () => {
    const archive = await buildArchive();
    const controller = new AbortController();
    controller.abort();
    const createCategoryRow = fakeCreateCategory();

    const failure = importCategory({
      file: archive,
      categoryName: 'Coins',
      ...baseFakes(),
      createCategoryRow,
      signal: controller.signal,
    });

    await expect(failure).rejects.toBeInstanceOf(ImportCancelledError);
    await expect(failure).rejects.toHaveProperty('message', 'Import cancelled');
    await expect(failure).rejects.toHaveProperty(
      'name',
      'ImportCancelledError',
    );
    expect(createCategoryRow).not.toHaveBeenCalled();
  });

  it('cleans up the new category when cancelled between item batches', async () => {
    const archive = await buildArchive({
      items: Array.from({ length: ITEM_INSERT_BATCH_SIZE + 1 }, (_, i) =>
        item({ id: `o${i}` }),
      ),
      photosByItemId: {},
    });
    const controller = new AbortController();
    // Aborted during the first batch and noticed at the next checkpoint, as a real mid-await signal is.
    const createItemRows = vi.fn(async () => {
      controller.abort();
      return { error: null };
    }) as unknown as CreateItemRows;
    const deleteCategoryRow = fakeDeleteCategory();
    const createCategoryRow = fakeCreateCategory('new-cat-1');

    const failure = importCategory({
      file: archive,
      categoryName: 'Coins',
      ...baseFakes(),
      createCategoryRow,
      createItemRows,
      deleteCategoryRow,
      signal: controller.signal,
    });

    await expect(failure).rejects.toBeInstanceOf(ImportCancelledError);
    expect(createItemRows).toHaveBeenCalledOnce();
    expect(deleteCategoryRow).toHaveBeenCalledWith('new-cat-1');
  });

  it('stops the whole photo pool and cleans up when cancelled mid-upload, rather than skipping just one photo', async () => {
    const archive = await buildArchive();
    const controller = new AbortController();
    const compressThumb = vi.fn(async (bytes: Uint8Array<ArrayBuffer>) => {
      controller.abort();
      return new Blob([bytes]);
    }) as unknown as CompressThumb;
    const deleteCategoryRow = fakeDeleteCategory();
    const createCategoryRow = fakeCreateCategory('new-cat-1');

    const failure = importCategory({
      file: archive,
      categoryName: 'Coins',
      ...baseFakes(),
      createCategoryRow,
      deleteCategoryRow,
      compressThumb,
      signal: controller.signal,
    });

    await expect(failure).rejects.toBeInstanceOf(ImportCancelledError);
    expect(deleteCategoryRow).toHaveBeenCalledWith('new-cat-1');
  });
});

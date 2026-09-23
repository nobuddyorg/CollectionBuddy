import { describe, expect, it, vi } from 'vitest';

import { importCategory } from './importCategory';
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

describe('importCategory, cleaning up after a failure', () => {
  it('cleans up and rethrows when linking the items to the category fails', async () => {
    const archive = await buildArchive();
    const linkError = new Error('link failed');
    const linkItemRows = vi.fn(async () => ({
      error: linkError,
    })) as unknown as LinkItemRows;
    const deleteItemRows = fakeDeleteItems();
    const deleteCategoryRow = fakeDeleteCategory();
    const createCategoryRow = fakeCreateCategory('new-cat-1');
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const failure = importCategory({
      file: archive,
      categoryName: 'Coins',
      ...baseFakes(),
      createCategoryRow,
      linkItemRows,
      deleteItemRows,
      deleteCategoryRow,
    });

    await expect(failure).rejects.toThrow('Could not link items to category');
    await expect(failure).rejects.toHaveProperty('cause', linkError);
    // Unlinked items are out of the category cascade's reach, so they go by id; the category goes too.
    expect(deleteItemRows).toHaveBeenCalledWith(['new-item-1']);
    expect(deleteCategoryRow).toHaveBeenCalledWith('new-cat-1');
    // The cleanup succeeded, so nothing is logged: only a failed cleanup earns a console.error.
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('logs, without throwing, when deleting the unlinked items fails too', async () => {
    const archive = await buildArchive();
    const cleanupError = new Error('delete failed');
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const failure = importCategory({
      file: archive,
      categoryName: 'Coins',
      ...baseFakes(),
      linkItemRows: vi.fn(async () => ({
        error: new Error('link failed'),
      })) as unknown as LinkItemRows,
      deleteItemRows: vi.fn(async () => ({
        error: cleanupError,
      })) as unknown as DeleteItemRows,
    });

    await expect(failure).rejects.toThrow('Could not link items to category');
    expect(consoleError).toHaveBeenCalledWith(
      'Could not clean up unlinked items',
      cleanupError,
    );
    consoleError.mockRestore();
  });

  it('cleans up the new category when creating the items fails, and rethrows', async () => {
    const archive = await buildArchive();
    const itemError = new Error('insert failed');
    const createItemRows = vi.fn(async () => ({
      error: itemError,
    })) as unknown as CreateItemRows;
    const linkItemRows = fakeLinkItems();
    const deleteCategoryRow = fakeDeleteCategory();
    const createCategoryRow = fakeCreateCategory('new-cat-1');

    const failure = importCategory({
      file: archive,
      categoryName: 'Coins',
      ...baseFakes(),
      createCategoryRow,
      createItemRows,
      linkItemRows,
      deleteCategoryRow,
    });

    await expect(failure).rejects.toThrow('Could not create items');
    await expect(failure).rejects.toHaveProperty('name', 'ImportError');
    await expect(failure).rejects.toHaveProperty('cause', itemError);
    expect(linkItemRows).not.toHaveBeenCalled();
    expect(deleteCategoryRow).toHaveBeenCalledWith('new-cat-1');
  });

  it('logs, without throwing, when the cleanup delete itself fails', async () => {
    const archive = await buildArchive();
    const createItemRows = vi.fn(async () => ({
      error: new Error('insert failed'),
    })) as unknown as CreateItemRows;
    const cleanupError = new Error('delete also failed');
    const deleteCategoryRow = vi.fn(async () => ({
      error: cleanupError,
    })) as unknown as DeleteCategoryRow;
    const createCategoryRow = fakeCreateCategory('new-cat-1');
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const failure = importCategory({
      file: archive,
      categoryName: 'Coins',
      ...baseFakes(),
      createCategoryRow,
      createItemRows,
      deleteCategoryRow,
    });

    // The original error, not the cleanup's, is what surfaces.
    await expect(failure).rejects.toThrow('Could not create items');
    expect(consoleError).toHaveBeenCalledWith(
      'Could not clean up partially-imported category',
      'new-cat-1',
      cleanupError,
    );
    consoleError.mockRestore();
  });
});

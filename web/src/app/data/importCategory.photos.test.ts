import { describe, expect, it, vi } from 'vitest';

import { importCategory, type ImportProgress } from './importCategory';
import {
  buildManifest,
  EXPORT_FORMAT,
  EXPORT_FORMAT_VERSION,
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

// A manifest item claiming a photo the archive never got, as a corrupt or hand-edited archive could.
function archiveMissingOnePhoto(): Blob {
  const writer = createZipWriter();
  const encoder = new TextEncoder();
  const manifest = {
    format: EXPORT_FORMAT,
    version: EXPORT_FORMAT_VERSION,
    exported_at: '2026-08-06T00:00:00.000Z',
    category: { id: 'orig-cat-1', name: 'Coins' },
    items: [
      {
        ...item(),
        folder: '001-seated-dime',
        photos: ['photos/001-seated-dime/1.webp'],
      },
    ],
  };
  writer.add({
    path: 'root/collection.json',
    bytes: encoder.encode(JSON.stringify(manifest)),
  });
  return writer.finish();
}

describe('importCategory, recreating the photographs', () => {
  it('uploads each photograph and a regenerated thumbnail under the new item id', async () => {
    const archive = await buildArchive({
      photosByItemId: { 'orig-item-1': [new Uint8Array([1, 2, 3])] },
    });
    const uploadImage = fakeUploadImage();
    const compressThumb = fakeCompressThumb();
    const createImage = fakeCreateImage();
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await importCategory({
      file: archive,
      categoryName: 'Coins',
      ...baseFakes(),
      uploadImage,
      compressThumb,
      createImage,
    });

    expect(result.photoCount).toBe(1);
    expect(result.skippedPhotoCount).toBe(0);
    expect(uploadImage).toHaveBeenCalledTimes(2); // full + thumb
    const [fullCall, thumbCall] = (uploadImage as ReturnType<typeof vi.fn>).mock
      .calls as [string, Blob][];
    const [fullPath, fullBlob] = fullCall;
    const [thumbPath, thumbBlob] = thumbCall;
    expect(fullPath).toMatch(/^uid\/new-item-1\/.+\.webp$/);
    expect(thumbPath).toMatch(/^uid\/new-item-1\/.+\.thumb\.webp$/);
    // The full upload carries the archive's own bytes and content type.
    expect(fullBlob.type).toBe('image/webp');
    expect(new Uint8Array(await fullBlob.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    // The thumbnail is whatever compressThumb produced, uploaded as-is.
    expect(await thumbBlob.text()).toBe('thumb');
    expect(compressThumb).toHaveBeenCalledTimes(1);
    // Recorded with the base name both uploads used, thumbnail path included since it succeeded.
    const base = fullPath.slice(0, -'.webp'.length);
    expect(createImage).toHaveBeenCalledWith({
      item_id: 'new-item-1',
      path_full: `${base}.webp`,
      path_thumb: `${base}.thumb.webp`,
      size_bytes: 3,
    });
    expect(consoleWarn).not.toHaveBeenCalled();
    consoleWarn.mockRestore();
  });

  it('skips a photograph missing from the archive rather than failing the import', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const progress: ImportProgress[] = [];

    const result = await importCategory({
      file: archiveMissingOnePhoto(),
      categoryName: 'Coins',
      ...baseFakes(),
      onProgress: (step) => progress.push(step),
    });

    expect(result.photoCount).toBe(0);
    expect(result.skippedPhotoCount).toBe(1);
    expect(consoleError).toHaveBeenCalledWith(
      'Photo missing from archive',
      'photos/001-seated-dime/1.webp',
    );
    // A missing photo still counts as "done" for the progress bar, not silently left out of the total.
    expect(progress[progress.length - 1]).toEqual({
      phase: 'photos',
      done: 1,
      total: 1,
    });
    consoleError.mockRestore();
  });

  it('does not require an onProgress callback to skip a missing photograph', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const result = await importCategory({
      file: archiveMissingOnePhoto(),
      categoryName: 'Coins',
      ...baseFakes(),
    });

    expect(result.skippedPhotoCount).toBe(1);
    consoleError.mockRestore();
  });

  it('skips a photograph whose uploads succeed but whose row cannot be recorded', async () => {
    const rowError = new Error('row insert failed');
    const createImage = vi.fn(async () => ({
      data: null,
      error: rowError,
    })) as unknown as CreateImage;
    const archive = await buildArchive();
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    vi.useFakeTimers();
    try {
      const promise = importCategory({
        file: archive,
        categoryName: 'Coins',
        ...baseFakes(),
        createImage,
      });
      await vi.advanceTimersByTimeAsync(10_000);
      const result = await promise;
      expect(result.photoCount).toBe(0);
      expect(result.skippedPhotoCount).toBe(1);
      expect(consoleError).toHaveBeenCalledWith(
        'Skipping photograph',
        expect.any(String),
        expect.objectContaining({
          message: 'Could not record photograph',
          cause: rowError,
        }),
      );
    } finally {
      vi.useRealTimers();
      consoleError.mockRestore();
    }
  });
});

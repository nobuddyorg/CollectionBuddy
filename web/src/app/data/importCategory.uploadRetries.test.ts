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

describe('importCategory, retrying a photograph upload', () => {
  it('retries a failed photo upload before giving up and skipping it', async () => {
    let calls = 0;
    const uploadImage = vi.fn(async () => {
      calls++;
      return calls < 3 ? { error: new Error('flaky') } : { error: null };
    }) as unknown as UploadImage;
    const archive = await buildArchive();
    vi.useFakeTimers();
    try {
      const promise = importCategory({
        file: archive,
        categoryName: 'Coins',
        ...baseFakes(),
        uploadImage,
      });
      await vi.advanceTimersByTimeAsync(10_000);
      const result = await promise;
      expect(result.photoCount).toBe(1);
      expect(result.skippedPhotoCount).toBe(0);
      // 2 failures + 1 success for the full upload, then 1 more (fresh attempt counter) for the thumbnail.
      expect(calls).toBe(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('spaces retries with exponential backoff and gives up after exactly 3 attempts', async () => {
    let calls = 0;
    const uploadErrors: Error[] = [];
    const uploadImage = vi.fn(async () => {
      calls++;
      const error = new Error('storage down');
      uploadErrors.push(error);
      return { error };
    }) as unknown as UploadImage;
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
        uploadImage,
      });

      // Attempt 0 fires immediately, with no delay beforehand.
      await vi.advanceTimersByTimeAsync(0);
      expect(calls).toBe(1);

      // Attempt 1 waits a 500ms base delay -- not before, not instantly.
      await vi.advanceTimersByTimeAsync(499);
      expect(calls).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(calls).toBe(2);

      // Attempt 2 waits double that (1000ms): exponential, not flat or decreasing.
      await vi.advanceTimersByTimeAsync(999);
      expect(calls).toBe(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(calls).toBe(3);

      // No 4th attempt: PHOTO_UPLOAD_ATTEMPTS is 3, not more.
      await vi.advanceTimersByTimeAsync(10_000);
      expect(calls).toBe(3);

      const result = await promise;
      expect(result.photoCount).toBe(0);
      expect(result.skippedPhotoCount).toBe(1);
      const loggedError = (consoleError.mock.calls[0] as unknown[])[2] as Error;
      expect(loggedError.message).toBe('Could not upload photograph');
      // The 3rd (final) attempt's own error, not the 1st or 2nd's.
      expect(loggedError.cause).toBe(uploadErrors[2]);
    } finally {
      vi.useRealTimers();
      consoleError.mockRestore();
    }
  });

  // A retry of the same path meets the object a failed attempt wrote: storage has no update policy.
  it('skips a photograph whose retry meets the object the failed attempt already wrote', async () => {
    const written = new Set<string>();
    const uploadImage = vi.fn(async (path: string) => {
      if (written.has(path)) return { error: new Error('Duplicate') };
      written.add(path);
      return { error: new Error('connection lost after the object landed') };
    }) as unknown as UploadImage;
    const createImage = fakeCreateImage();
    const archive = await buildArchive();
    vi.useFakeTimers();
    try {
      const promise = importCategory({
        file: archive,
        categoryName: 'Coins',
        ...baseFakes(),
        uploadImage,
        createImage,
      });
      await vi.advanceTimersByTimeAsync(10_000);
      const result = await promise;

      expect(result.itemCount).toBe(1);
      expect(result.photoCount).toBe(0);
      expect(result.skippedPhotoCount).toBe(1);
      // Three attempts at the full size and none at the thumbnail: the full size failing ends the photo.
      expect(uploadImage).toHaveBeenCalledTimes(3);
      expect([...written]).toEqual([
        expect.stringMatching(/^uid\/new-item-1\/[0-9a-f-]+\.webp$/),
      ]);
      expect(createImage).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('still counts the photograph a success when only its thumbnail fails to upload', async () => {
    const uploadImage = vi.fn(async (path: string) =>
      path.endsWith('.thumb.webp')
        ? { error: new Error('thumb storage down') }
        : { error: null },
    ) as unknown as UploadImage;
    const createImage = fakeCreateImage();
    const archive = await buildArchive();
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.useFakeTimers();
    try {
      const promise = importCategory({
        file: archive,
        categoryName: 'Coins',
        ...baseFakes(),
        uploadImage,
        createImage,
      });
      await vi.advanceTimersByTimeAsync(10_000);
      const result = await promise;
      expect(result.photoCount).toBe(1);
      expect(result.skippedPhotoCount).toBe(0);
      expect(consoleWarn).toHaveBeenCalledWith(
        'Thumbnail upload failed:',
        expect.any(Error),
      );
      // No usable thumbnail, so the row records none -- not the full photo's path standing in.
      expect(createImage).toHaveBeenCalledWith(
        expect.objectContaining({ path_thumb: null }),
      );
    } finally {
      vi.useRealTimers();
      consoleWarn.mockRestore();
    }
  });
});

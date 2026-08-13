import { describe, expect, it, vi } from 'vitest';

import {
  ImportCancelledError,
  importCategory,
  PHOTO_UPLOAD_CONCURRENCY,
  type ImportProgress,
} from './importCategory';
import { ImportFormatError } from './importFormat';
import {
  buildManifest,
  EXPORT_FORMAT,
  EXPORT_FORMAT_VERSION,
  exportEntries,
  MANIFEST_NAME,
} from './exportFormat';
import { createZipWriter } from './zip';
import type { ExportItem } from './exportFormat';

type ImportParams = Parameters<typeof importCategory>[0];
type GetUid = ImportParams['getUid'];
type CreateCategoryRow = ImportParams['createCategoryRow'];
type DeleteCategoryRow = ImportParams['deleteCategoryRow'];
type CreateItemRow = ImportParams['createItemRow'];
type LinkItemToCategoryRow = ImportParams['linkItemToCategoryRow'];
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

/**
 * Builds a real archive, the same way exportCategory.ts does, but from a
 * caller-supplied item/photo list rather than a live export -- so
 * importCategory.test.ts exercises the actual format two independent
 * modules (zip.ts, exportFormat.ts) agree on, not a hand-rolled stand-in
 * that could quietly drift from it.
 */
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
  writer.add(
    `${root}/${MANIFEST_NAME}`,
    encoder.encode(JSON.stringify(manifest)),
  );
  for (const entry of entries) {
    for (const photo of entry.photos) {
      const [itemId, indexStr] = photo.storagePath.split('/');
      const bytes =
        photosByItemId[itemId][Number(indexStr.replace('.webp', ''))];
      writer.add(`${root}/${photo.archivePath}`, bytes);
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

function fakeCreateItem(): CreateItemRow {
  let n = 0;
  return vi.fn(async () => ({
    data: { id: `new-item-${++n}` },
    error: null,
  })) as unknown as CreateItemRow;
}

function fakeLinkItemToCategory(): LinkItemToCategoryRow {
  return vi.fn(async () => ({
    error: null,
  })) as unknown as LinkItemToCategoryRow;
}

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
    createItemRow: fakeCreateItem(),
    linkItemToCategoryRow: fakeLinkItemToCategory(),
    uploadImage: fakeUploadImage(),
    createImage: fakeCreateImage(),
    compressThumb: fakeCompressThumb(),
  };
}

describe('importCategory', () => {
  it('throws a named ImportError rather than importing when there is no session', async () => {
    const archive = await buildArchive();
    const failure = importCategory({
      file: archive,
      categoryName: 'Coins',
      ...baseFakes(),
      getUid: fakeGetUid(null),
    });
    await expect(failure).rejects.toThrow('No user session');
    await expect(failure).rejects.toHaveProperty('name', 'ImportError');
  });

  it('rejects a file that is not a ZIP archive at all', async () => {
    const failure = importCategory({
      file: new Blob(['not a zip']),
      categoryName: 'Coins',
      ...baseFakes(),
    });
    await expect(failure).rejects.toHaveProperty('name', 'ImportError');
  });

  it('rejects an archive with no collection.json', async () => {
    const writer = createZipWriter();
    writer.add('root/photos/1.webp', new Uint8Array([1]));
    const failure = importCategory({
      file: writer.finish(),
      categoryName: 'Coins',
      ...baseFakes(),
    });
    await expect(failure).rejects.toBeInstanceOf(ImportFormatError);
  });

  it("rejects an archive whose manifest is not this app's format", async () => {
    const writer = createZipWriter();
    const encoder = new TextEncoder();
    writer.add(
      'root/collection.json',
      encoder.encode(JSON.stringify({ format: 'something-else' })),
    );
    const failure = importCategory({
      file: writer.finish(),
      categoryName: 'Coins',
      ...baseFakes(),
    });
    await expect(failure).rejects.toBeInstanceOf(ImportFormatError);
  });

  it('rejects an archive whose collection.json is not valid JSON', async () => {
    const writer = createZipWriter();
    const encoder = new TextEncoder();
    writer.add('root/collection.json', encoder.encode('{not json'));
    const failure = importCategory({
      file: writer.finish(),
      categoryName: 'Coins',
      ...baseFakes(),
    });
    await expect(failure).rejects.toBeInstanceOf(ImportFormatError);
  });

  it("creates a new category with the given name, not the archive's original name", async () => {
    const archive = await buildArchive();
    const createCategoryRow = fakeCreateCategory();
    await importCategory({
      file: archive,
      categoryName: 'Coins (2)',
      ...baseFakes(),
      createCategoryRow,
    });
    expect(createCategoryRow).toHaveBeenCalledWith('Coins (2)');
  });

  it('creates one item per manifest entry, linked to the new category', async () => {
    const archive = await buildArchive({
      items: [
        item({ id: 'a', title: 'Dime' }),
        item({ id: 'b', title: 'Nickel' }),
      ],
      photosByItemId: {},
    });
    const createItemRow = fakeCreateItem();
    const linkItemToCategoryRow = fakeLinkItemToCategory();
    const createCategoryRow = fakeCreateCategory('new-cat-1');
    const result = await importCategory({
      file: archive,
      categoryName: 'Coins',
      ...baseFakes(),
      createCategoryRow,
      createItemRow,
      linkItemToCategoryRow,
    });

    expect(createItemRow).toHaveBeenCalledTimes(2);
    expect(createItemRow).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Dime' }),
    );
    expect(createItemRow).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Nickel' }),
    );
    expect(linkItemToCategoryRow).toHaveBeenCalledWith(
      'new-item-1',
      'new-cat-1',
    );
    expect(linkItemToCategoryRow).toHaveBeenCalledWith(
      'new-item-2',
      'new-cat-1',
    );
    expect(result.itemCount).toBe(2);
  });

  it('cleans up and rethrows when linking the item to the category fails', async () => {
    const archive = await buildArchive();
    const linkItemToCategoryRow = vi.fn(async () => ({
      error: new Error('link failed'),
    })) as unknown as LinkItemToCategoryRow;
    const deleteCategoryRow = fakeDeleteCategory();
    const createCategoryRow = fakeCreateCategory('new-cat-1');

    const failure = importCategory({
      file: archive,
      categoryName: 'Coins',
      ...baseFakes(),
      createCategoryRow,
      linkItemToCategoryRow,
      deleteCategoryRow,
    });

    await expect(failure).rejects.toThrow('Could not link item to category');
    expect(deleteCategoryRow).toHaveBeenCalledWith('new-cat-1');
  });

  it('uploads each photograph and a regenerated thumbnail under the new item id', async () => {
    const archive = await buildArchive();
    const uploadImage = fakeUploadImage();
    const compressThumb = fakeCompressThumb();
    const result = await importCategory({
      file: archive,
      categoryName: 'Coins',
      ...baseFakes(),
      uploadImage,
      compressThumb,
    });

    expect(result.photoCount).toBe(1);
    expect(result.skippedPhotoCount).toBe(0);
    expect(uploadImage).toHaveBeenCalledTimes(2); // full + thumb
    const [fullCall, thumbCall] = (uploadImage as ReturnType<typeof vi.fn>).mock
      .calls as [string, Blob][][];
    expect(fullCall[0]).toMatch(/^uid\/new-item-1\/.+\.webp$/);
    expect(thumbCall[0]).toMatch(/^uid\/new-item-1\/.+\.thumb\.webp$/);
    expect(compressThumb).toHaveBeenCalledTimes(1);
  });

  it('skips a photograph missing from the archive rather than failing the import', async () => {
    // Hand-construct a manifest item that claims a photo the archive
    // never actually got, the same kind of mismatch a corrupt or
    // hand-edited archive could produce.
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
    writer.add(
      'root/collection.json',
      encoder.encode(JSON.stringify(manifest)),
    );
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const result = await importCategory({
      file: writer.finish(),
      categoryName: 'Coins',
      ...baseFakes(),
    });

    expect(result.photoCount).toBe(0);
    expect(result.skippedPhotoCount).toBe(1);
    consoleError.mockRestore();
  });

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
    } finally {
      vi.useRealTimers();
    }
  });

  it('skips a photograph whose upload never succeeds, without failing the whole import', async () => {
    const uploadImage = vi.fn(async () => ({
      error: new Error('storage down'),
    })) as unknown as UploadImage;
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
      await vi.advanceTimersByTimeAsync(10_000);
      const result = await promise;
      expect(result.photoCount).toBe(0);
      expect(result.skippedPhotoCount).toBe(1);
    } finally {
      vi.useRealTimers();
      consoleError.mockRestore();
    }
  });

  it('still counts the photograph a success when only its thumbnail fails to upload', async () => {
    const uploadImage = vi.fn(async (path: string) =>
      path.endsWith('.thumb.webp')
        ? { error: new Error('thumb storage down') }
        : { error: null },
    ) as unknown as UploadImage;
    const archive = await buildArchive();
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
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
      expect(consoleWarn).toHaveBeenCalledWith(
        'Thumbnail upload failed:',
        expect.any(Error),
      );
    } finally {
      vi.useRealTimers();
      consoleWarn.mockRestore();
    }
  });

  it('cleans up the new category when creating an item fails, and rethrows', async () => {
    const archive = await buildArchive();
    const createItemRow = vi.fn(async () => ({
      data: null,
      error: new Error('insert failed'),
    })) as unknown as CreateItemRow;
    const deleteCategoryRow = fakeDeleteCategory();
    const createCategoryRow = fakeCreateCategory('new-cat-1');

    const failure = importCategory({
      file: archive,
      categoryName: 'Coins',
      ...baseFakes(),
      createCategoryRow,
      createItemRow,
      deleteCategoryRow,
    });

    await expect(failure).rejects.toHaveProperty('name', 'ImportError');
    expect(deleteCategoryRow).toHaveBeenCalledWith('new-cat-1');
  });

  it('does not touch the category at all when creating it fails -- nothing to clean up', async () => {
    const archive = await buildArchive();
    const createCategoryRow = vi.fn(async () => ({
      data: null,
      error: new Error('duplicate name'),
    })) as unknown as CreateCategoryRow;
    const deleteCategoryRow = fakeDeleteCategory();

    const failure = importCategory({
      file: archive,
      categoryName: 'Coins',
      ...baseFakes(),
      createCategoryRow,
      deleteCategoryRow,
    });

    await expect(failure).rejects.toHaveProperty('name', 'ImportError');
    expect(deleteCategoryRow).not.toHaveBeenCalled();
  });

  it('logs, without throwing, when the cleanup delete itself fails', async () => {
    const archive = await buildArchive();
    const createItemRow = vi.fn(async () => ({
      data: null,
      error: new Error('insert failed'),
    })) as unknown as CreateItemRow;
    const deleteCategoryRow = vi.fn(async () => ({
      error: new Error('delete also failed'),
    })) as unknown as DeleteCategoryRow;
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const failure = importCategory({
      file: archive,
      categoryName: 'Coins',
      ...baseFakes(),
      createItemRow,
      deleteCategoryRow,
    });

    // The original error, not the cleanup's, is what surfaces.
    await expect(failure).rejects.toThrow('Could not create item');
    consoleError.mockRestore();
  });

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
    expect(createCategoryRow).not.toHaveBeenCalled();
  });

  it('cleans up the new category when cancelled mid-import', async () => {
    const archive = await buildArchive({
      items: [item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })],
      photosByItemId: {},
    });
    const controller = new AbortController();
    let calls = 0;
    const createItemRow = vi.fn(async () => {
      calls++;
      // Aborted during the second item -- caught by the cancellation check
      // at the top of the third loop iteration, the same way a real signal
      // firing mid-await is only ever noticed at the next checkpoint.
      if (calls === 2) controller.abort();
      return { data: { id: `new-item-${calls}` }, error: null };
    }) as unknown as CreateItemRow;
    const deleteCategoryRow = fakeDeleteCategory();
    const createCategoryRow = fakeCreateCategory('new-cat-1');

    const failure = importCategory({
      file: archive,
      categoryName: 'Coins',
      ...baseFakes(),
      createCategoryRow,
      createItemRow,
      deleteCategoryRow,
      signal: controller.signal,
    });

    await expect(failure).rejects.toBeInstanceOf(ImportCancelledError);
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

  it('reports progress through reading, items and photos', async () => {
    const archive = await buildArchive();
    const progress: ImportProgress[] = [];
    await importCategory({
      file: archive,
      categoryName: 'Coins',
      ...baseFakes(),
      onProgress: (p) => progress.push(p),
    });

    expect(progress[0]).toEqual({ phase: 'reading', done: 0, total: 0 });
    expect(progress.some((p) => p.phase === 'items')).toBe(true);
    expect(progress.some((p) => p.phase === 'photos')).toBe(true);
    const last = progress[progress.length - 1];
    expect(last).toEqual({ phase: 'photos', done: 1, total: 1 });
  });

  it('uploads through a bounded pool, not one unbounded burst', async () => {
    const photoCount = PHOTO_UPLOAD_CONCURRENCY * 2;
    const photosByItemId = Object.fromEntries(
      Array.from({ length: photoCount }, (_, i) => [
        `item-${i}`,
        [new Uint8Array([i])],
      ]),
    );
    const items = Object.keys(photosByItemId).map((id) => item({ id }));
    const archive = await buildArchive({ items, photosByItemId });

    let inFlight = 0;
    let maxInFlight = 0;
    const release: (() => void)[] = [];
    const uploadImage = vi.fn(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise<void>((resolve) => release.push(resolve));
      inFlight--;
      return { error: null };
    }) as unknown as UploadImage;

    const promise = importCategory({
      file: archive,
      categoryName: 'Coins',
      ...baseFakes(),
      uploadImage,
    });

    await vi.waitFor(() =>
      expect(release.length).toBe(PHOTO_UPLOAD_CONCURRENCY),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(maxInFlight).toBe(PHOTO_UPLOAD_CONCURRENCY);

    // Two uploadImage calls per photo (full, then its thumbnail) -- both
    // sequential within one task, so this drains every call the pool makes
    // in total rather than one per photo.
    for (let released = 0; released < photoCount * 2; released++) {
      await vi.waitFor(() => expect(release.length).toBeGreaterThan(0));
      release.shift()!();
    }

    const result = await promise;
    expect(result.photoCount).toBe(photoCount);
    expect(maxInFlight).toBeLessThanOrEqual(PHOTO_UPLOAD_CONCURRENCY);
  });
});

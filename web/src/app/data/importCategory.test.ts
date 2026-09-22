import { describe, expect, it, vi } from 'vitest';

import {
  ImportCancelledError,
  importCategory,
  ITEM_INSERT_BATCH_SIZE,
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

/**
 * Builds a real archive from a caller-supplied item/photo list, the same
 * way exportCategory.ts does -- exercises the actual format zip.ts and
 * exportFormat.ts agree on, not a hand-rolled stand-in.
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
    await expect(failure).rejects.toHaveProperty(
      'message',
      'Could not read this file as a ZIP archive',
    );
    await expect(failure).rejects.toHaveProperty('cause');
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
    await expect(failure).rejects.toHaveProperty(
      'message',
      'Not a CollectionBuddy export archive',
    );
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
    // Rethrown as-is, not re-wrapped -- a different message from the
    // generic "could not read collection.json" below would prove this went
    // through the re-throw branch, not the catch-all one.
    await expect(failure).rejects.toHaveProperty(
      'message',
      'Not a CollectionBuddy export archive',
    );
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
    await expect(failure).rejects.toHaveProperty(
      'message',
      'Could not read collection.json in this archive',
    );
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

    const sizes = (fn: unknown) =>
      (fn as ReturnType<typeof vi.fn>).mock.calls.map(
        ([rows]) => (rows as unknown[]).length,
      );
    expect(sizes(createItemRows)).toEqual([ITEM_INSERT_BATCH_SIZE, 1]);
    expect(sizes(linkItemRows)).toEqual([ITEM_INSERT_BATCH_SIZE, 1]);
    expect(
      onProgress.mock.calls.map(([p]) => p).filter((p) => p.phase === 'items'),
    ).toEqual([
      { phase: 'items', done: 0, total: count },
      { phase: 'items', done: ITEM_INSERT_BATCH_SIZE, total: count },
      { phase: 'items', done: count, total: count },
    ]);
  });

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
    // Unlinked items are out of the category cascade's reach, so they go
    // by id; the category itself goes too.
    expect(deleteItemRows).toHaveBeenCalledWith(['new-item-1']);
    expect(deleteCategoryRow).toHaveBeenCalledWith('new-cat-1');
    // The cleanup itself succeeded here, so nothing about it should be
    // logged -- only a failed cleanup earns a console.error (see the
    // dedicated "logs, without throwing" tests below).
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
    // The full upload carries the archive's own bytes and content type,
    // not an empty or mistyped blob.
    expect(fullBlob.type).toBe('image/webp');
    expect(new Uint8Array(await fullBlob.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    // The thumbnail is whatever compressThumb produced, uploaded as-is.
    expect(await thumbBlob.text()).toBe('thumb');
    expect(compressThumb).toHaveBeenCalledTimes(1);
    // Recorded with the same base name both uploads used, thumbnail path
    // included since it did succeed -- not skipped, warned about, or lost.
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

  // Hand-constructs a manifest item that claims a photo the archive never
  // actually got, the same kind of mismatch a corrupt or hand-edited
  // archive could produce.
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
    writer.add(
      'root/collection.json',
      encoder.encode(JSON.stringify(manifest)),
    );
    return writer.finish();
  }

  it('skips a photograph missing from the archive rather than failing the import', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const progress: ImportProgress[] = [];

    const result = await importCategory({
      file: archiveMissingOnePhoto(),
      categoryName: 'Coins',
      ...baseFakes(),
      onProgress: (p) => progress.push(p),
    });

    expect(result.photoCount).toBe(0);
    expect(result.skippedPhotoCount).toBe(1);
    expect(consoleError).toHaveBeenCalledWith(
      'Photo missing from archive',
      'photos/001-seated-dime/1.webp',
    );
    // A missing photo still counts as "done" for the progress bar -- it's
    // accounted for, not silently left out of the total.
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
      // 2 failures + 1 success for the full upload, then 1 more (a fresh
      // attempt counter) for its thumbnail, which this mock also lets
      // through immediately once `calls` has passed 3.
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

      // Attempt 2 waits double that (1000ms): exponential, not a flat 500ms
      // repeated or a decreasing delay.
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

  // The repeat-operation case named in TEST_STRATEGY.md's idempotency
  // table: uploadWithRetry retries the *same path* and treats every storage
  // failure as retryable, so an attempt that wrote its object before failing
  // leaves the next attempt facing an object it cannot overwrite -- there is
  // no update policy on storage.objects. The photograph is skipped rather
  // than failing the import, no images row is written, and the object left
  // behind is exactly what the daily sweep collects.
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
      // Three attempts at the full size, and no thumbnail attempt at all:
      // the full size failing is what ends this photograph.
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
      // No usable thumbnail, so the row records none -- not the full
      // photo's own path standing in for it.
      expect(createImage).toHaveBeenCalledWith(
        expect.objectContaining({ path_thumb: null }),
      );
    } finally {
      vi.useRealTimers();
      consoleWarn.mockRestore();
    }
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

  it('does not touch the category at all when creating it fails -- nothing to clean up', async () => {
    const archive = await buildArchive();
    const categoryError = new Error('duplicate name');
    const createCategoryRow = vi.fn(async () => ({
      data: null,
      error: categoryError,
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
    await expect(failure).rejects.toHaveProperty(
      'message',
      'Could not create category',
    );
    await expect(failure).rejects.toHaveProperty('cause', categoryError);
    expect(deleteCategoryRow).not.toHaveBeenCalled();
  });

  it('treats a missing category row as a failure even without an explicit error', async () => {
    const archive = await buildArchive();
    const createCategoryRow = vi.fn(async () => ({
      data: null,
      error: null,
    })) as unknown as CreateCategoryRow;

    const failure = importCategory({
      file: archive,
      categoryName: 'Coins',
      ...baseFakes(),
      createCategoryRow,
    });

    await expect(failure).rejects.toThrow('Could not create category');
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
    // Aborted during the first batch -- caught by the cancellation check
    // before the second, the same way a real signal firing mid-await is
    // only ever noticed at the next checkpoint.
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

  it('reports progress through reading, items and photos', async () => {
    const archive = await buildArchive();
    const progress: ImportProgress[] = [];
    await importCategory({
      file: archive,
      categoryName: 'Coins',
      ...baseFakes(),
      onProgress: (p) => progress.push(p),
    });

    // One item, one photo: every step of the sequence is deterministic, so
    // the whole thing is worth pinning down exactly, not just spot-checked
    // -- each entry's own `done`/`total` matter as much as its phase.
    expect(progress).toEqual([
      { phase: 'reading', done: 0, total: 0 },
      { phase: 'items', done: 0, total: 1 },
      { phase: 'items', done: 1, total: 1 },
      { phase: 'photos', done: 0, total: 1 },
      { phase: 'photos', done: 1, total: 1 },
    ]);
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

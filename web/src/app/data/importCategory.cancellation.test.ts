import { describe, expect, it, vi } from 'vitest';

import { ImportCancelledError } from './importCancellation';
import { importCategory, ITEM_INSERT_BATCH_SIZE } from './importCategory';
import {
  type CreateItemRows,
  type CompressThumb,
  type DeleteCategoryRow,
  type RemoveImages,
  type UploadImage,
  item,
  buildArchive,
  fakeCreateCategory,
  fakeDeleteCategory,
  fakeRemoveImages,
  baseFakes,
} from './importCategory.test-support';

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
      return new Blob([bytes], { type: 'image/webp' });
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

// Two photographs, so the cancel lands while the other is still in the pool.
async function twoPhotoArchive() {
  return buildArchive({
    items: [item({ id: 'o1' }), item({ id: 'o2' })],
    photosByItemId: {
      o1: [new Uint8Array([1])],
      o2: [new Uint8Array([2])],
    },
  });
}

// Cancels on the first upload, which the fake still answers as `result`.
function uploadThatCancels(
  controller: AbortController,
  result: { error: Error | null },
): UploadImage {
  return vi.fn(async () => {
    controller.abort();
    return { data: null, ...result };
  }) as unknown as UploadImage;
}

function uploadedPaths(uploadImage: UploadImage): string[] {
  return vi.mocked(uploadImage!).mock.calls.map(([path]) => path);
}

describe('importCategory, rolling back photographs already sent', () => {
  it('removes every object it uploaded before it deletes the category', async () => {
    const controller = new AbortController();
    const uploadImage = uploadThatCancels(controller, { error: null });
    const removeImages = fakeRemoveImages();
    const deleteCategoryRow = fakeDeleteCategory();

    const failure = importCategory({
      file: await twoPhotoArchive(),
      categoryName: 'Coins',
      ...baseFakes(),
      uploadImage,
      removeImages,
      deleteCategoryRow,
      signal: controller.signal,
    });

    await expect(failure).rejects.toBeInstanceOf(ImportCancelledError);
    const paths = uploadedPaths(uploadImage);
    expect(paths).toHaveLength(1);
    expect(removeImages).toHaveBeenCalledExactlyOnceWith(paths);
    expect(deleteCategoryRow).toHaveBeenCalledWith('new-cat-1');
    expect(vi.mocked(removeImages!).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(deleteCategoryRow!).mock.invocationCallOrder[0],
    );
  });

  it('removes an upload that reported failure too, since its object may still have been stored', async () => {
    const controller = new AbortController();
    const uploadImage = uploadThatCancels(controller, {
      error: new Error('timed out'),
    });
    const removeImages = fakeRemoveImages();

    const failure = importCategory({
      file: await twoPhotoArchive(),
      categoryName: 'Coins',
      ...baseFakes(),
      uploadImage,
      removeImages,
      signal: controller.signal,
    });

    await expect(failure).rejects.toBeInstanceOf(ImportCancelledError);
    expect(removeImages).toHaveBeenCalledExactlyOnceWith(
      uploadedPaths(uploadImage),
    );
  });

  it('names a retried path once, however many attempts it took', async () => {
    const controller = new AbortController();
    const attemptsByPath = new Map<string, number>();
    const uploadImage = vi.fn(async (path: string) => {
      const attempt = (attemptsByPath.get(path) ?? 0) + 1;
      attemptsByPath.set(path, attempt);
      if (attempt === 2) controller.abort();
      return { data: null, error: new Error('flaky') };
    }) as unknown as UploadImage;
    const removeImages = fakeRemoveImages();
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const archive = await twoPhotoArchive();
    vi.useFakeTimers();
    try {
      const failure = importCategory({
        file: archive,
        categoryName: 'Coins',
        ...baseFakes(),
        uploadImage,
        removeImages,
        signal: controller.signal,
      });
      const settled =
        expect(failure).rejects.toBeInstanceOf(ImportCancelledError);
      await vi.advanceTimersByTimeAsync(10_000);
      await settled;
    } finally {
      vi.useRealTimers();
      consoleError.mockRestore();
    }

    expect(uploadedPaths(uploadImage).length).toBeGreaterThan(2);
    expect(removeImages).toHaveBeenCalledExactlyOnceWith([
      ...attemptsByPath.keys(),
    ]);
    expect(attemptsByPath.size).toBe(2);
  });

  it('keeps the category, and logs, when its objects cannot be removed', async () => {
    const controller = new AbortController();
    const removeError = new Error('storage down');
    const removeImages = vi.fn(async () => ({
      data: null,
      error: removeError,
    })) as unknown as RemoveImages;
    const deleteCategoryRow: DeleteCategoryRow = fakeDeleteCategory();
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const failure = importCategory({
      file: await twoPhotoArchive(),
      categoryName: 'Coins',
      ...baseFakes(),
      uploadImage: uploadThatCancels(controller, { error: null }),
      removeImages,
      deleteCategoryRow,
      signal: controller.signal,
    });

    await expect(failure).rejects.toBeInstanceOf(ImportCancelledError);
    expect(deleteCategoryRow).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      'Could not clean up partially-imported category',
      'new-cat-1',
      removeError,
    );
    consoleError.mockRestore();
  });

  it('sends Storage nothing when no photograph was uploaded yet', async () => {
    const controller = new AbortController();
    const compressThumb = vi.fn(async () => {
      controller.abort();
      return new Blob(['thumb'], { type: 'image/webp' });
    }) as unknown as CompressThumb;
    const removeImages = fakeRemoveImages();
    const deleteCategoryRow = fakeDeleteCategory();

    const failure = importCategory({
      file: await twoPhotoArchive(),
      categoryName: 'Coins',
      ...baseFakes(),
      compressThumb,
      removeImages,
      deleteCategoryRow,
      signal: controller.signal,
    });

    await expect(failure).rejects.toBeInstanceOf(ImportCancelledError);
    expect(removeImages).not.toHaveBeenCalled();
    expect(deleteCategoryRow).toHaveBeenCalledWith('new-cat-1');
  });
});

import { describe, expect, it, vi } from 'vitest';

import { ImportCancelledError } from './importCancellation';
import { importCategory, ITEM_INSERT_BATCH_SIZE } from './importCategory';
import {
  type CreateItemRows,
  type CompressThumb,
  item,
  buildArchive,
  fakeCreateCategory,
  fakeDeleteCategory,
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

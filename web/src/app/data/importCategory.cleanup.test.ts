import { describe, expect, it, vi } from 'vitest';

import { importCategory } from './importCategory';
import {
  type DeleteCategoryRow,
  type CreateItemRows,
  buildArchive,
  fakeCreateCategory,
  fakeDeleteCategory,
  baseFakes,
} from './importCategory.test-support';

describe('importCategory, cleaning up after a failure', () => {
  it('cleans up the new category when creating the items fails, and rethrows', async () => {
    const archive = await buildArchive();
    const itemError = new Error('insert failed');
    const createItemRows = vi.fn(async () => ({
      error: itemError,
    })) as unknown as CreateItemRows;
    const deleteCategoryRow = fakeDeleteCategory();
    const createCategoryRow = fakeCreateCategory('new-cat-1');
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const failure = importCategory({
      file: archive,
      nameCategory: () => 'Coins',
      ...baseFakes(),
      createCategoryRow,
      createItemRows,
      deleteCategoryRow,
    });

    await expect(failure).rejects.toThrow('Could not create items');
    await expect(failure).rejects.toHaveProperty('name', 'ImportError');
    await expect(failure).rejects.toHaveProperty('cause', itemError);
    expect(deleteCategoryRow).toHaveBeenCalledWith('new-cat-1');
    // The category's cascade takes the batches already created; a cleanup that worked logs nothing.
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
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
      nameCategory: () => 'Coins',
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

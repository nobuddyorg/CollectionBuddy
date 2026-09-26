import { describe, expect, it, vi } from 'vitest';

import { importCategory } from './importCategory';
import {
  type DeleteCategoryRow,
  type CreateItemRows,
  type LinkItemRows,
  type DeleteItemRows,
  buildArchive,
  fakeCreateCategory,
  fakeDeleteCategory,
  fakeLinkItems,
  fakeDeleteItems,
  baseFakes,
} from './importCategory.test-support';

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
      nameCategory: () => 'Coins',
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
      nameCategory: () => 'Coins',
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
      nameCategory: () => 'Coins',
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

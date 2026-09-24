// @vitest-environment jsdom
import { act, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  deleteCategory as deleteCategoryRow,
  listItemIdsForCategory,
  listItemIdsLinkedElsewhere,
} from '../../data/categories';
import { listImagePathsForItems, removeImageObjects } from '../../data/images';
import {
  CATEGORY_ONE,
  commitDeferredDelete,
  installDeleteMocks,
  renderLoadedCategories,
} from './useCategories.test-support';

vi.mock('../../data/categories', () => ({
  listCategories: vi.fn(),
  createCategory: vi.fn(),
  deleteCategory: vi.fn(),
  renameCategory: vi.fn(),
  listItemIdsForCategory: vi.fn(),
  listItemIdsLinkedElsewhere: vi.fn(),
}));

// Two paths per removal, so IMAGE_ROWS' three paths span two batches.
vi.mock('../../data/images', () => ({
  listImagePathsForItems: vi.fn(),
  removeImageObjects: vi.fn(),
  REMOVE_OBJECTS_BATCH_SIZE: 2,
}));

describe('useCategories deleteCategory orphan detection', () => {
  beforeEach(installDeleteMocks);

  it('aborts and reports when reading the category items fails', async () => {
    const listingError = new Error('offline');
    vi.mocked(listItemIdsForCategory).mockResolvedValue({
      data: null,
      error: listingError,
    });
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const { result } = await renderLoadedCategories();

    act(() => {
      result.current.deleteCategory('cat-1');
    });
    await commitDeferredDelete();

    await screen.findByRole('alert');
    expect(deleteCategoryRow).not.toHaveBeenCalled();
    expect(result.current.categories).toEqual([CATEGORY_ONE]);
    expect(consoleError).toHaveBeenCalledWith(
      'delete category',
      expect.objectContaining({
        message: 'Could not list items for category',
        cause: listingError,
      }),
    );
    consoleError.mockRestore();
  });

  it('treats a null items-for-category answer as no items to orphan', async () => {
    vi.mocked(deleteCategoryRow).mockResolvedValue({ error: null } as never);
    vi.mocked(listItemIdsForCategory).mockResolvedValue({
      data: null,
      error: null,
    });
    const { result } = await renderLoadedCategories();

    act(() => {
      result.current.deleteCategory('cat-1');
    });
    await commitDeferredDelete();

    await waitFor(() =>
      expect(deleteCategoryRow).toHaveBeenCalledWith('cat-1'),
    );
    expect(listItemIdsLinkedElsewhere).not.toHaveBeenCalled();
    expect(removeImageObjects).not.toHaveBeenCalled();
  });

  it('treats a null linked-elsewhere answer as nothing kept', async () => {
    vi.mocked(deleteCategoryRow).mockResolvedValue({ error: null } as never);
    vi.mocked(listItemIdsLinkedElsewhere).mockResolvedValue({
      data: null,
      error: null,
    });
    const { result } = await renderLoadedCategories();

    act(() => {
      result.current.deleteCategory('cat-1');
    });
    await commitDeferredDelete();

    await waitFor(() => expect(removeImageObjects).toHaveBeenCalledTimes(2));
  });

  // The one test of the keep/filter branch: an item linked elsewhere, which the cascade leaves alone.
  it('cleans up only the items the deletion actually orphaned, leaving one still linked elsewhere untouched', async () => {
    vi.mocked(deleteCategoryRow).mockResolvedValue({ error: null } as never);
    vi.mocked(listItemIdsForCategory).mockResolvedValue({
      data: ['i1', 'i2'],
      error: null,
    });
    // i1 is still linked to another category, so the cascade leaves it in place.
    vi.mocked(listItemIdsLinkedElsewhere).mockResolvedValue({
      data: ['i1'],
      error: null,
    });
    const { result } = await renderLoadedCategories();

    act(() => {
      result.current.deleteCategory('cat-1');
    });
    await commitDeferredDelete();

    await waitFor(() =>
      expect(removeImageObjects).toHaveBeenCalledWith([
        'u/i2/b.webp',
        'u/i2/b.thumb.webp',
      ]),
    );
    expect(listItemIdsLinkedElsewhere).toHaveBeenCalledWith({
      itemIds: ['i1', 'i2'],
      excludingCategoryId: 'cat-1',
    });
    expect(listImagePathsForItems).toHaveBeenCalledWith(['i2']);
    expect(removeImageObjects).toHaveBeenCalledTimes(1);
  });

  // An incomplete answer must stop the whole deletion, category row included.
  it('aborts the entire deletion, including the category row, when the linked-elsewhere check fails', async () => {
    const pageError = new Error('truncated page');
    vi.mocked(listItemIdsLinkedElsewhere).mockResolvedValue({
      data: null,
      error: pageError,
    });
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const { result } = await renderLoadedCategories();

    act(() => {
      result.current.deleteCategory('cat-1');
    });
    await commitDeferredDelete();

    await screen.findByRole('alert');
    expect(deleteCategoryRow).not.toHaveBeenCalled();
    expect(listImagePathsForItems).not.toHaveBeenCalled();
    expect(removeImageObjects).not.toHaveBeenCalled();
    expect(result.current.categories).toEqual([CATEGORY_ONE]);
    expect(consoleError).toHaveBeenCalledWith(
      'delete category',
      expect.objectContaining({
        message: 'Could not check items linked elsewhere',
        cause: pageError,
      }),
    );
    consoleError.mockRestore();
  });

  // Nothing to filter down: an empty category has no items to orphan or keep.
  it('never asks which items are linked elsewhere when the category held none', async () => {
    vi.mocked(deleteCategoryRow).mockResolvedValue({ error: null } as never);
    vi.mocked(listItemIdsForCategory).mockResolvedValue({
      data: [],
      error: null,
    });
    const { result } = await renderLoadedCategories();

    act(() => {
      result.current.deleteCategory('cat-1');
    });
    await commitDeferredDelete();

    await waitFor(() =>
      expect(deleteCategoryRow).toHaveBeenCalledWith('cat-1'),
    );
    // Settled, so the removal step has run -- and had nothing to remove.
    await waitFor(() => expect(result.current.isDeleting).toBe(false));
    expect(listItemIdsLinkedElsewhere).not.toHaveBeenCalled();
    expect(listImagePathsForItems).not.toHaveBeenCalled();
    expect(removeImageObjects).not.toHaveBeenCalled();
  });
});

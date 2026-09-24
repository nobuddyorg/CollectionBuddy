// @vitest-environment jsdom
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { deleteCategory as deleteCategoryRow } from '../../data/categories';
import {
  CATEGORY_ONE,
  commitDeferredDelete,
  installDeleteMocks,
  listCategoriesReturns,
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

describe('useCategories deleteCategory', () => {
  beforeEach(installDeleteMocks);

  it('does nothing for an empty id', async () => {
    const { result } = await renderLoadedCategories();

    act(() => {
      result.current.deleteCategory('');
    });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(result.current.categories).toEqual([CATEGORY_ONE]);
  });

  it('does nothing for a category that is no longer in the list', async () => {
    const { result } = await renderLoadedCategories();

    act(() => {
      result.current.deleteCategory('cat-nope');
    });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(result.current.categories).toEqual([CATEGORY_ONE]);
  });

  it('ignores a second delete of a different category while one is still deferred', async () => {
    const CAT_2 = { id: 'cat-2', name: 'Cat 2', user_id: 'owner-1' };
    listCategoriesReturns([CATEGORY_ONE, CAT_2]);
    let release: (() => void) | undefined;
    vi.mocked(deleteCategoryRow).mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve({ error: null });
      }) as never,
    );
    const { result } = await renderLoadedCategories();

    act(() => {
      result.current.deleteCategory('cat-1');
    });
    await commitDeferredDelete();
    await waitFor(() => expect(result.current.isDeleting).toBe(true));

    act(() => {
      result.current.deleteCategory('cat-2');
    });

    expect(result.current.categories).toEqual([CAT_2]);
    expect(deleteCategoryRow).toHaveBeenCalledTimes(1);
    await act(async () => {
      release?.();
    });
  });

  // onLeave shares this path but does not always pass onRestore; undo must not crash without it.
  it('tolerates an undo when options carry no onRestore callback', async () => {
    const { result } = await renderLoadedCategories();

    act(() => {
      result.current.deleteCategory('cat-1', {});
    });

    await screen.findByRole('status');
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(result.current.categories).toEqual([CATEGORY_ONE]);
    expect(deleteCategoryRow).not.toHaveBeenCalled();
  });

  it('calls options.onRestore once an undo restores the category', async () => {
    const onRestore = vi.fn();
    const { result } = await renderLoadedCategories();

    act(() => {
      result.current.deleteCategory('cat-1', { onRestore });
    });

    await screen.findByRole('status');
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(result.current.categories).toEqual([CATEGORY_ONE]);
  });

  it('clears isDeleting once a delete settles, letting the next one proceed', async () => {
    vi.mocked(deleteCategoryRow).mockResolvedValue({ error: null } as never);
    const { result } = await renderLoadedCategories();

    act(() => {
      result.current.deleteCategory('cat-1');
    });
    await commitDeferredDelete();
    await waitFor(() => expect(result.current.isDeleting).toBe(false));

    const CAT_2 = { id: 'cat-2', name: 'Cat 2', user_id: 'owner-1' };
    listCategoriesReturns([CAT_2]);
    await act(async () => {
      await result.current.reload();
    });

    act(() => {
      result.current.deleteCategory('cat-2');
    });
    await commitDeferredDelete();

    await waitFor(() =>
      expect(deleteCategoryRow).toHaveBeenCalledWith('cat-2'),
    );
  });
});

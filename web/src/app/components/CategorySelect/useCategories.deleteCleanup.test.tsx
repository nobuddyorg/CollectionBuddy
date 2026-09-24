// @vitest-environment jsdom
import { act, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { deleteCategory as deleteCategoryRow } from '../../data/categories';
import { listImagePathsForItems, removeImageObjects } from '../../data/images';
import {
  CATEGORY_ONE,
  IMAGE_ROWS,
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

describe('useCategories deleteCategory image cleanup', () => {
  beforeEach(installDeleteMocks);

  it('aborts and restores the collection when reading orphaned images fails', async () => {
    vi.mocked(deleteCategoryRow).mockResolvedValue({ error: null } as never);
    vi.mocked(listImagePathsForItems).mockResolvedValue({
      data: null,
      error: new Error('offline'),
    });
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const { result } = await renderLoadedCategories();

    act(() => {
      result.current.deleteCategory('cat-1');
    });
    await commitDeferredDelete();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not delete collection. Please try again.',
    );
    expect(removeImageObjects).not.toHaveBeenCalled();
    expect(deleteCategoryRow).not.toHaveBeenCalled();
    expect(result.current.categories).toEqual([CATEGORY_ONE]);
    expect(consoleError).toHaveBeenCalledWith(
      'delete category',
      expect.objectContaining({
        message: 'Could not read images for orphaned items',
      }),
    );
    const reported: unknown = consoleError.mock.calls[0]?.[1];
    expect(reported).toMatchObject({ cause: { message: 'offline' } });
    consoleError.mockRestore();
  });
  it('treats an empty image-paths answer as no photographs to remove', async () => {
    vi.mocked(deleteCategoryRow).mockResolvedValue({ error: null } as never);
    vi.mocked(listImagePathsForItems).mockResolvedValue({
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
    expect(removeImageObjects).not.toHaveBeenCalled();
  });

  it('skips an orphaned item that had no photographs of its own', async () => {
    vi.mocked(deleteCategoryRow).mockResolvedValue({ error: null } as never);
    vi.mocked(listImagePathsForItems).mockResolvedValue({
      data: [IMAGE_ROWS[0]],
      error: null,
    });
    const { result } = await renderLoadedCategories();

    act(() => {
      result.current.deleteCategory('cat-1');
    });
    await commitDeferredDelete();

    await waitFor(() => expect(removeImageObjects).toHaveBeenCalledTimes(1));
    expect(removeImageObjects).toHaveBeenCalledWith(['u/i1/a.webp']);
  });

  it('reports a resolved storage error the same as a rejection, and keeps the row', async () => {
    vi.mocked(deleteCategoryRow).mockResolvedValue({ error: null } as never);
    vi.mocked(removeImageObjects).mockResolvedValue({
      data: null,
      error: new Error('storage down'),
    } as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = await renderLoadedCategories();

    act(() => {
      result.current.deleteCategory('cat-1');
    });
    await commitDeferredDelete();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not delete collection. Please try again.',
    );
    expect(deleteCategoryRow).not.toHaveBeenCalled();
    expect(result.current.categories).toEqual([CATEGORY_ONE]);
  });
  it('removes every photograph before the category row, and reports nothing on success', async () => {
    vi.mocked(deleteCategoryRow).mockResolvedValue({ error: null } as never);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const { result } = await renderLoadedCategories();

    act(() => {
      result.current.deleteCategory('cat-1');
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Collection deleted.',
    );
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    await commitDeferredDelete();

    await waitFor(() =>
      expect(deleteCategoryRow).toHaveBeenCalledWith('cat-1'),
    );
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
    expect(removeImageObjects).toHaveBeenCalledTimes(2);
    expect(removeImageObjects).toHaveBeenCalledWith([
      'u/i1/a.webp',
      'u/i2/b.webp',
    ]);
    expect(removeImageObjects).toHaveBeenCalledWith(['u/i2/b.thumb.webp']);

    // The read, then every byte removal, strictly before the row delete.
    const readOrder = vi.mocked(listImagePathsForItems).mock
      .invocationCallOrder[0];
    const rowOrder = vi.mocked(deleteCategoryRow).mock.invocationCallOrder[0];
    expect(readOrder).toBeLessThan(rowOrder);
    for (const call of vi.mocked(removeImageObjects).mock.invocationCallOrder) {
      expect(call).toBeGreaterThan(readOrder);
      expect(call).toBeLessThan(rowOrder);
    }

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it("reads every orphaned item's image paths in one batched query, not once per item", async () => {
    vi.mocked(deleteCategoryRow).mockResolvedValue({ error: null } as never);
    const { result } = await renderLoadedCategories();

    act(() => {
      result.current.deleteCategory('cat-1');
    });
    await commitDeferredDelete();

    await waitFor(() =>
      expect(listImagePathsForItems).toHaveBeenCalledWith(['i1', 'i2']),
    );
    expect(listImagePathsForItems).toHaveBeenCalledTimes(1);
  });

  it('restores the collection and reports the error when the row delete fails after the photographs went', async () => {
    vi.mocked(deleteCategoryRow).mockResolvedValue({
      error: new Error('offline'),
    } as never);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const { result } = await renderLoadedCategories();

    act(() => {
      result.current.deleteCategory('cat-1');
    });
    await commitDeferredDelete();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not delete collection. Please try again.',
    );
    expect(removeImageObjects).toHaveBeenCalledTimes(2);
    // The row is still there, so restoring shows what the database has.
    expect(result.current.categories).toEqual([CATEGORY_ONE]);
    expect(consoleError).toHaveBeenCalledWith(
      'delete category',
      expect.objectContaining({ message: 'offline' }),
    );
    consoleError.mockRestore();
  });
  it('stops at a failed removal batch, keeps the row, and restores the collection', async () => {
    vi.mocked(deleteCategoryRow).mockResolvedValue({ error: null } as never);
    vi.mocked(removeImageObjects)
      .mockResolvedValueOnce({ data: [], error: null })
      .mockRejectedValueOnce(new Error('storage down'));
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const { result } = await renderLoadedCategories();

    act(() => {
      result.current.deleteCategory('cat-1');
    });
    await commitDeferredDelete();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not delete collection. Please try again.',
    );
    expect(removeImageObjects).toHaveBeenCalledTimes(2);
    expect(deleteCategoryRow).not.toHaveBeenCalled();
    expect(result.current.categories).toEqual([CATEGORY_ONE]);
    expect(consoleError).toHaveBeenCalledWith(
      'delete category',
      expect.objectContaining({ message: 'storage down' }),
    );
    consoleError.mockRestore();
  });
  it('attempts no further batch once one has failed', async () => {
    vi.mocked(deleteCategoryRow).mockResolvedValue({ error: null } as never);
    vi.mocked(removeImageObjects)
      .mockRejectedValueOnce(new Error('storage down'))
      .mockResolvedValueOnce({ data: [], error: null });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = await renderLoadedCategories();

    act(() => {
      result.current.deleteCategory('cat-1');
    });
    await commitDeferredDelete();

    await screen.findByRole('alert');
    expect(removeImageObjects).toHaveBeenCalledTimes(1);
    expect(removeImageObjects).toHaveBeenCalledWith([
      'u/i1/a.webp',
      'u/i2/b.webp',
    ]);
    expect(deleteCategoryRow).not.toHaveBeenCalled();
  });
});

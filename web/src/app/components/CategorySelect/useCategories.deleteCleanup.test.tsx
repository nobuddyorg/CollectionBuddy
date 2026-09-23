// @vitest-environment jsdom
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import {
  createCategory,
  deleteCategory as deleteCategoryRow,
  listCategories,
  listItemIdsForCategory,
  listItemIdsLinkedElsewhere,
  renameCategory,
} from '../../data/categories';
import { listImagePathsForItems, removeImageObjects } from '../../data/images';
import { useCategories } from './useCategories';

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

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <ToastProvider>{children}</ToastProvider>
    </I18nProvider>
  );
}

const IMAGE_ROWS = [
  { item_id: 'i1', path_full: 'u/i1/a.webp', path_thumb: null },
  { item_id: 'i2', path_full: 'u/i2/b.webp', path_thumb: 'u/i2/b.thumb.webp' },
];

const CAT_1 = { id: 'cat-1', name: 'Cat 1', user_id: 'owner-1' };

// Commits the deferred delete by closing the toast, the same as letting it auto-dismiss would.
async function commitDeferredDelete() {
  await screen.findByRole('status');
  await userEvent.click(screen.getByRole('button', { name: 'Close' }));
}
describe('useCategories deleteCategory image cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('lang', 'en');
    vi.mocked(listCategories).mockResolvedValue({
      data: [CAT_1],
      error: null,
    } as never);
    vi.mocked(createCategory).mockResolvedValue({
      data: null,
      error: null,
    } as never);
    vi.mocked(renameCategory).mockResolvedValue({
      data: null,
      error: null,
    } as never);
    vi.mocked(listItemIdsForCategory).mockResolvedValue({
      data: ['i1', 'i2'],
      error: null,
    });
    vi.mocked(listItemIdsLinkedElsewhere).mockResolvedValue({
      data: [],
      error: null,
    });
    vi.mocked(listImagePathsForItems).mockResolvedValue({
      data: IMAGE_ROWS,
      error: null,
    });
    vi.mocked(removeImageObjects).mockResolvedValue({
      data: [],
      error: null,
    });
  });

  it('logs but continues when reading orphaned images fails', async () => {
    vi.mocked(deleteCategoryRow).mockResolvedValue({ error: null } as never);
    vi.mocked(listImagePathsForItems).mockResolvedValue({
      data: null,
      error: new Error('offline'),
    });
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const { result } = renderHook(() => useCategories(), { wrapper });
    await act(async () => {
      await result.current.reload();
    });

    act(() => {
      result.current.deleteCategory('cat-1');
    });
    await commitDeferredDelete();

    await waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(
        'Could not read images for orphaned items:',
        expect.any(Error),
      ),
    );
    expect(deleteCategoryRow).toHaveBeenCalledWith('cat-1');
    expect(removeImageObjects).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('treats an empty image-paths answer as no photographs to remove', async () => {
    vi.mocked(deleteCategoryRow).mockResolvedValue({ error: null } as never);
    vi.mocked(listImagePathsForItems).mockResolvedValue({
      data: [],
      error: null,
    });
    const { result } = renderHook(() => useCategories(), { wrapper });
    await act(async () => {
      await result.current.reload();
    });

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
    const { result } = renderHook(() => useCategories(), { wrapper });
    await act(async () => {
      await result.current.reload();
    });

    act(() => {
      result.current.deleteCategory('cat-1');
    });
    await commitDeferredDelete();

    await waitFor(() => expect(removeImageObjects).toHaveBeenCalledTimes(1));
    expect(removeImageObjects).toHaveBeenCalledWith(['u/i1/a.webp']);
  });

  it('reports a resolved storage error the same as a rejection', async () => {
    vi.mocked(deleteCategoryRow).mockResolvedValue({ error: null } as never);
    vi.mocked(removeImageObjects).mockResolvedValue({
      data: null,
      error: new Error('storage down'),
    } as never);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const { result } = renderHook(() => useCategories(), { wrapper });
    await act(async () => {
      await result.current.reload();
    });

    act(() => {
      result.current.deleteCategory('cat-1');
    });
    await commitDeferredDelete();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This collection was deleted, but some of its photographs could not be removed and may still count against your storage.',
    );
    consoleError.mockRestore();
  });

  it('deletes the category row before touching any photograph, and cleans up on success', async () => {
    vi.mocked(deleteCategoryRow).mockResolvedValue({ error: null } as never);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const { result } = renderHook(() => useCategories(), { wrapper });
    await act(async () => {
      await result.current.reload();
    });

    act(() => {
      result.current.deleteCategory('cat-1');
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Collection deleted.',
    );
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    await commitDeferredDelete();

    await waitFor(() => expect(removeImageObjects).toHaveBeenCalledTimes(2));
    // No image-read error to report on the happy path.
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
    expect(deleteCategoryRow).toHaveBeenCalledWith('cat-1');
    expect(removeImageObjects).toHaveBeenCalledWith([
      'u/i1/a.webp',
      'u/i2/b.webp',
    ]);
    expect(removeImageObjects).toHaveBeenCalledWith(['u/i2/b.thumb.webp']);

    // Every byte removal is ordered strictly after the row delete, the first real mutation.
    const readOrder = vi.mocked(listImagePathsForItems).mock
      .invocationCallOrder[0];
    const rowOrder = vi.mocked(deleteCategoryRow).mock.invocationCallOrder[0];
    expect(readOrder).toBeLessThan(rowOrder);
    for (const call of vi.mocked(removeImageObjects).mock.invocationCallOrder) {
      expect(call).toBeGreaterThan(rowOrder);
    }

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it("reads every orphaned item's image paths in one batched query, not once per item", async () => {
    vi.mocked(deleteCategoryRow).mockResolvedValue({ error: null } as never);
    const { result } = renderHook(() => useCategories(), { wrapper });
    await act(async () => {
      await result.current.reload();
    });

    act(() => {
      result.current.deleteCategory('cat-1');
    });
    await commitDeferredDelete();

    await waitFor(() =>
      expect(listImagePathsForItems).toHaveBeenCalledWith(['i1', 'i2']),
    );
    expect(listImagePathsForItems).toHaveBeenCalledTimes(1);
  });

  it('leaves every photograph untouched when the row delete fails, and reports the error', async () => {
    vi.mocked(deleteCategoryRow).mockResolvedValue({
      error: new Error('offline'),
    } as never);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const { result } = renderHook(() => useCategories(), { wrapper });
    await act(async () => {
      await result.current.reload();
    });

    act(() => {
      result.current.deleteCategory('cat-1');
    });
    await commitDeferredDelete();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not delete collection. Please try again.',
    );
    // The read still happened (harmless), but nothing that acts on it did.
    expect(listImagePathsForItems).toHaveBeenCalledWith(['i1', 'i2']);
    expect(removeImageObjects).not.toHaveBeenCalled();
    // Failure restores the row rather than leaving it hidden.
    expect(result.current.categories).toEqual([CAT_1]);
    expect(consoleError).toHaveBeenCalledWith(
      'delete category',
      expect.objectContaining({ message: 'offline' }),
    );
    consoleError.mockRestore();
  });

  it('reports a cleanup failure without undoing the already-successful row delete', async () => {
    vi.mocked(deleteCategoryRow).mockResolvedValue({ error: null } as never);
    vi.mocked(removeImageObjects)
      .mockResolvedValueOnce({ data: [], error: null })
      .mockRejectedValueOnce(new Error('storage down'));
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const { result } = renderHook(() => useCategories(), { wrapper });
    await act(async () => {
      await result.current.reload();
    });

    act(() => {
      result.current.deleteCategory('cat-1');
    });
    await commitDeferredDelete();

    // The row is already gone, irreversibly: a cleanup failure is a leak, so the row stays deleted.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This collection was deleted, but some of its photographs could not be removed and may still count against your storage.',
    );
    expect(removeImageObjects).toHaveBeenCalledTimes(2);
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to clean up category images:',
      expect.objectContaining({ message: 'storage down' }),
    );
    consoleError.mockRestore();
  });

  it('does not let one failed image removal stop the rest from being attempted', async () => {
    vi.mocked(deleteCategoryRow).mockResolvedValue({ error: null } as never);
    vi.mocked(removeImageObjects)
      .mockRejectedValueOnce(new Error('storage down'))
      .mockResolvedValueOnce({ data: [], error: null });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useCategories(), { wrapper });
    await act(async () => {
      await result.current.reload();
    });

    act(() => {
      result.current.deleteCategory('cat-1');
    });
    await commitDeferredDelete();

    // Both batches were attempted though the first rejected; Promise.all would have stopped.
    await waitFor(() =>
      expect(removeImageObjects).toHaveBeenCalledWith(['u/i2/b.thumb.webp']),
    );
    expect(removeImageObjects).toHaveBeenCalledWith([
      'u/i1/a.webp',
      'u/i2/b.webp',
    ]);
  });
});

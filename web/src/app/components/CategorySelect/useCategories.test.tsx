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

// The row/cascade must delete first; storage bytes are only touched once
// that has actually succeeded -- otherwise a failed row delete (offline,
// 5xx) could leave the category in place with its photographs already,
// irrecoverably, gone. Reading the paths ahead of the row delete is safe
// regardless, since it's a read, not a mutation.
const CAT_1 = { id: 'cat-1', name: 'Cat 1', user_id: 'owner-1' };

// deleteCategory hides the row from `cats` immediately and defers the
// actual delete to the toast's undo window (see useToast) -- committed
// here by closing the toast, the same as letting it auto-dismiss would.
async function commitDeferredDelete() {
  await screen.findByRole('status');
  await userEvent.click(screen.getByRole('button', { name: 'Close' }));
}

describe('useCategories deleteCategory', () => {
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

  it('does nothing for an empty id', async () => {
    const { result } = renderHook(() => useCategories(), { wrapper });
    await act(async () => {
      await result.current.reload();
    });

    act(() => {
      result.current.deleteCategory('');
    });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(result.current.cats).toEqual([CAT_1]);
  });

  it('does nothing for a category that is no longer in the list', async () => {
    const { result } = renderHook(() => useCategories(), { wrapper });
    await act(async () => {
      await result.current.reload();
    });

    act(() => {
      result.current.deleteCategory('cat-nope');
    });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(result.current.cats).toEqual([CAT_1]);
  });

  it('ignores a second delete of a different category while one is still deferred', async () => {
    const CAT_2 = { id: 'cat-2', name: 'Cat 2', user_id: 'owner-1' };
    vi.mocked(listCategories).mockResolvedValue({
      data: [CAT_1, CAT_2],
      error: null,
    } as never);
    let release: (() => void) | undefined;
    vi.mocked(deleteCategoryRow).mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve({ error: null });
      }) as never,
    );
    const { result } = renderHook(() => useCategories(), { wrapper });
    await act(async () => {
      await result.current.reload();
    });

    act(() => {
      result.current.deleteCategory('cat-1');
    });
    await commitDeferredDelete();
    await waitFor(() => expect(result.current.isDeleting).toBe(true));

    act(() => {
      result.current.deleteCategory('cat-2');
    });

    expect(result.current.cats).toEqual([CAT_2]);
    expect(deleteCategoryRow).toHaveBeenCalledTimes(1);
    await act(async () => {
      release?.();
    });
  });

  it('aborts and reports when reading the category items fails', async () => {
    const listingError = new Error('offline');
    vi.mocked(listItemIdsForCategory).mockResolvedValue({
      data: null,
      error: listingError,
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

    await screen.findByRole('alert');
    expect(deleteCategoryRow).not.toHaveBeenCalled();
    expect(result.current.cats).toEqual([CAT_1]);
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
    expect(listItemIdsLinkedElsewhere).not.toHaveBeenCalled();
    expect(removeImageObjects).not.toHaveBeenCalled();
  });

  it('treats a null linked-elsewhere answer as nothing kept', async () => {
    vi.mocked(deleteCategoryRow).mockResolvedValue({ error: null } as never);
    vi.mocked(listItemIdsLinkedElsewhere).mockResolvedValue({
      data: null,
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

    await waitFor(() => expect(removeImageObjects).toHaveBeenCalledTimes(2));
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

    // The row delete is the first thing to actually mutate anything --
    // every byte removal is ordered strictly after it.
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
    // The read still happened -- harmless either way -- but nothing that
    // acts on it did: not a single orphaned item's bytes were removed.
    expect(listImagePathsForItems).toHaveBeenCalledWith(['i1', 'i2']);
    expect(removeImageObjects).not.toHaveBeenCalled();
    // Failure restores the row rather than leaving it hidden.
    expect(result.current.cats).toEqual([CAT_1]);
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

    // The row is already gone, irreversibly -- a cleanup failure is a
    // storage leak, not data loss, so the row stays deleted.
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

    // Both batches were attempted even though the first rejected -- a
    // plain Promise.all would have stopped awaiting after that.
    await waitFor(() =>
      expect(removeImageObjects).toHaveBeenCalledWith(['u/i2/b.thumb.webp']),
    );
    expect(removeImageObjects).toHaveBeenCalledWith([
      'u/i1/a.webp',
      'u/i2/b.webp',
    ]);
  });

  // Every test above sets listItemIdsLinkedElsewhere to return nothing, so
  // none of them exercise the branch the keep/filter arithmetic exists
  // for -- an item linked to a second category, which the cascade leaves
  // alone. Wrong here is invisible: no error, just a photograph silently
  // deleted or kept when it shouldn't be.
  it('cleans up only the items the deletion actually orphaned, leaving one still linked elsewhere untouched', async () => {
    vi.mocked(deleteCategoryRow).mockResolvedValue({ error: null } as never);
    vi.mocked(listItemIdsForCategory).mockResolvedValue({
      data: ['i1', 'i2'],
      error: null,
    });
    // i1 is still linked to some other category -- the cascade leaves it
    // in place, so it must not be reported here.
    vi.mocked(listItemIdsLinkedElsewhere).mockResolvedValue({
      data: ['i1'],
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
      expect(removeImageObjects).toHaveBeenCalledWith([
        'u/i2/b.webp',
        'u/i2/b.thumb.webp',
      ]),
    );
    expect(listItemIdsLinkedElsewhere).toHaveBeenCalledWith(
      ['i1', 'i2'],
      'cat-1',
    );
    expect(listImagePathsForItems).toHaveBeenCalledWith(['i2']);
    expect(removeImageObjects).toHaveBeenCalledTimes(1);
  });

  // An incomplete answer (error mid-page, a failed chunk) must still stop
  // the deletion, including the category row itself, rather than being
  // treated as "nothing else links these items".
  it('aborts the entire deletion, including the category row, when the linked-elsewhere check fails', async () => {
    const pageError = new Error('truncated page');
    vi.mocked(listItemIdsLinkedElsewhere).mockResolvedValue({
      data: null,
      error: pageError,
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

    await screen.findByRole('alert');
    expect(deleteCategoryRow).not.toHaveBeenCalled();
    expect(listImagePathsForItems).not.toHaveBeenCalled();
    expect(removeImageObjects).not.toHaveBeenCalled();
    expect(result.current.cats).toEqual([CAT_1]);
    expect(consoleError).toHaveBeenCalledWith(
      'delete category',
      expect.objectContaining({
        message: 'Could not check items linked elsewhere',
        cause: pageError,
      }),
    );
    consoleError.mockRestore();
  });

  // The other half of the same branch: nothing to filter down at all, since
  // an empty category has no items to have been orphaned or kept.
  it('never asks which items are linked elsewhere when the category held none', async () => {
    vi.mocked(deleteCategoryRow).mockResolvedValue({ error: null } as never);
    vi.mocked(listItemIdsForCategory).mockResolvedValue({
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
    // Settled, so the removal step has run -- and had nothing to remove.
    await waitFor(() => expect(result.current.isDeleting).toBe(false));
    expect(listItemIdsLinkedElsewhere).not.toHaveBeenCalled();
    expect(listImagePathsForItems).not.toHaveBeenCalled();
    expect(removeImageObjects).not.toHaveBeenCalled();
  });

  // `opts` is how CategorySelect's onLeave shares the same optimistic-hide
  // path deleteCategory uses, but it doesn't always pass an `onRestore` --
  // undoing must not crash when it's missing.
  it('tolerates an undo when opts carries no onRestore callback', async () => {
    const { result } = renderHook(() => useCategories(), { wrapper });
    await act(async () => {
      await result.current.reload();
    });

    act(() => {
      result.current.deleteCategory('cat-1', {});
    });

    await screen.findByRole('status');
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(result.current.cats).toEqual([CAT_1]);
    expect(deleteCategoryRow).not.toHaveBeenCalled();
  });

  it('calls opts.onRestore once an undo restores the category', async () => {
    const onRestore = vi.fn();
    const { result } = renderHook(() => useCategories(), { wrapper });
    await act(async () => {
      await result.current.reload();
    });

    act(() => {
      result.current.deleteCategory('cat-1', { onRestore });
    });

    await screen.findByRole('status');
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(result.current.cats).toEqual([CAT_1]);
  });

  it('clears isDeleting once a delete settles, letting the next one proceed', async () => {
    vi.mocked(deleteCategoryRow).mockResolvedValue({ error: null } as never);
    const { result } = renderHook(() => useCategories(), { wrapper });
    await act(async () => {
      await result.current.reload();
    });

    act(() => {
      result.current.deleteCategory('cat-1');
    });
    await commitDeferredDelete();
    await waitFor(() => expect(result.current.isDeleting).toBe(false));

    const CAT_2 = { id: 'cat-2', name: 'Cat 2', user_id: 'owner-1' };
    vi.mocked(listCategories).mockResolvedValue({
      data: [CAT_2],
      error: null,
    } as never);
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

describe('useCategories reload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('lang', 'en');
  });

  it('is loading while the request is in flight, and done once it settles', async () => {
    let resolve: (v: { data: (typeof CAT_1)[]; error: null }) => void;
    vi.mocked(listCategories).mockReturnValue(
      new Promise((res) => {
        resolve = res;
      }) as never,
    );
    const { result } = renderHook(() => useCategories(), { wrapper });
    expect(result.current.isLoading).toBe(true);

    let reloadPromise!: Promise<unknown>;
    act(() => {
      reloadPromise = result.current.reload();
    });
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolve({ data: [CAT_1], error: null });
      await reloadPromise;
    });
    expect(result.current.isLoading).toBe(false);
  });

  it('reports the exact load-error message and logs the underlying error', async () => {
    vi.mocked(listCategories).mockResolvedValue({
      data: null,
      error: new Error('network down'),
    } as never);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const { result } = renderHook(() => useCategories(), { wrapper });

    await act(async () => {
      await result.current.reload();
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load collections. Please try again.',
    );
    expect(consoleError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'network down' }),
    );
    consoleError.mockRestore();
  });

  it('keeps loading true while a newer reload supersedes one still resolving', async () => {
    let resolveFirst: (v: { data: never[]; error: null }) => void;
    let resolveSecond: (v: { data: never[]; error: null }) => void;
    vi.mocked(listCategories)
      .mockReturnValueOnce(
        new Promise((res) => {
          resolveFirst = res;
        }) as never,
      )
      .mockReturnValueOnce(
        new Promise((res) => {
          resolveSecond = res;
        }) as never,
      );
    const { result } = renderHook(() => useCategories(), { wrapper });

    let firstPromise!: Promise<unknown>;
    let secondPromise!: Promise<unknown>;
    act(() => {
      firstPromise = result.current.reload();
    });
    act(() => {
      secondPromise = result.current.reload();
    });

    // The first (now-stale) request settling must not clear `isLoading`
    // while the second, current one is still in flight.
    await act(async () => {
      resolveFirst({ data: [], error: null });
      await firstPromise;
    });
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolveSecond({ data: [], error: null });
      await secondPromise;
    });
    expect(result.current.isLoading).toBe(false);
  });
});

describe('useCategories createCategory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('lang', 'en');
    vi.mocked(listCategories).mockResolvedValue({
      data: [],
      error: null,
    } as never);
  });

  it('is creating while the request is in flight, and done once it settles', async () => {
    let resolve: (v: { data: unknown; error: null }) => void;
    vi.mocked(createCategory).mockReturnValue(
      new Promise((res) => {
        resolve = res;
      }) as never,
    );
    const { result } = renderHook(() => useCategories(), { wrapper });

    let createPromise!: Promise<unknown>;
    act(() => {
      createPromise = result.current.createCategory('New');
    });
    expect(result.current.isCreating).toBe(true);

    await act(async () => {
      resolve({ data: { id: 'cat-9' }, error: null });
      await createPromise;
    });
    expect(result.current.isCreating).toBe(false);
  });

  it('ignores a second create while one is already in flight', async () => {
    let resolve: (v: { data: unknown; error: null }) => void;
    vi.mocked(createCategory).mockReturnValue(
      new Promise((res) => {
        resolve = res;
      }) as never,
    );
    const { result } = renderHook(() => useCategories(), { wrapper });

    act(() => {
      void result.current.createCategory('New');
    });
    await waitFor(() => expect(result.current.isCreating).toBe(true));

    let secondResult: unknown;
    await act(async () => {
      secondResult = await result.current.createCategory('New 2');
    });

    expect(secondResult).toBeNull();
    expect(createCategory).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve({ data: { id: 'cat-9' }, error: null });
    });
  });

  it('reports the exact create-error message and logs the underlying error under its own scope', async () => {
    vi.mocked(createCategory).mockResolvedValue({
      data: null,
      error: new Error('duplicate name'),
    } as never);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const { result } = renderHook(() => useCategories(), { wrapper });

    let created: unknown;
    await act(async () => {
      created = await result.current.createCategory('New');
    });

    expect(created).toBeNull();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not create collection. Please try again.',
    );
    expect(consoleError).toHaveBeenCalledWith(
      'create category',
      expect.objectContaining({ message: 'duplicate name' }),
    );
    consoleError.mockRestore();
  });
});

describe('useCategories renameCategory', () => {
  const CAT_A = { id: 'cat-a', name: 'Cat A', user_id: 'owner-1' };
  const CAT_B = { id: 'cat-b', name: 'Cat B', user_id: 'owner-1' };

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('lang', 'en');
    vi.mocked(listCategories).mockResolvedValue({
      data: [CAT_A, CAT_B],
      error: null,
    } as never);
  });

  it('renames only the matching category, leaving the rest untouched', async () => {
    vi.mocked(renameCategory).mockResolvedValue({
      data: { id: 'cat-a', name: 'Renamed A', user_id: 'owner-1' },
      error: null,
    } as never);
    const { result } = renderHook(() => useCategories(), { wrapper });
    await act(async () => {
      await result.current.reload();
    });

    let renamed: unknown;
    await act(async () => {
      renamed = await result.current.renameCategory('cat-a', 'Renamed A');
    });

    expect(renamed).toBe(true);
    expect(result.current.cats).toEqual([
      { id: 'cat-a', name: 'Renamed A', user_id: 'owner-1' },
      CAT_B,
    ]);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Collection renamed.',
    );
  });

  it('is renaming while the request is in flight, and done once it settles', async () => {
    let resolve: (v: { data: unknown; error: null }) => void;
    vi.mocked(renameCategory).mockReturnValue(
      new Promise((res) => {
        resolve = res;
      }) as never,
    );
    const { result } = renderHook(() => useCategories(), { wrapper });
    await act(async () => {
      await result.current.reload();
    });

    let renamePromise!: Promise<unknown>;
    act(() => {
      renamePromise = result.current.renameCategory('cat-a', 'Renamed A');
    });
    expect(result.current.isRenaming).toBe(true);

    await act(async () => {
      resolve({
        data: { id: 'cat-a', name: 'Renamed A', user_id: 'owner-1' },
        error: null,
      });
      await renamePromise;
    });
    expect(result.current.isRenaming).toBe(false);
  });

  it('ignores a second rename while one is already in flight', async () => {
    let resolve: (v: { data: unknown; error: null }) => void;
    vi.mocked(renameCategory).mockReturnValue(
      new Promise((res) => {
        resolve = res;
      }) as never,
    );
    const { result } = renderHook(() => useCategories(), { wrapper });
    await act(async () => {
      await result.current.reload();
    });

    act(() => {
      void result.current.renameCategory('cat-a', 'Renamed A');
    });
    await waitFor(() => expect(result.current.isRenaming).toBe(true));

    let secondResult: unknown;
    await act(async () => {
      secondResult = await result.current.renameCategory('cat-a', 'Again');
    });

    expect(secondResult).toBe(false);
    expect(renameCategory).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve({
        data: { id: 'cat-a', name: 'Renamed A', user_id: 'owner-1' },
        error: null,
      });
    });
  });

  it('reports the exact rename-error message and logs the underlying error under its own scope, clearing isRenaming even on failure', async () => {
    vi.mocked(renameCategory).mockResolvedValue({
      data: null,
      error: new Error('name taken'),
    } as never);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const { result } = renderHook(() => useCategories(), { wrapper });
    await act(async () => {
      await result.current.reload();
    });

    let renamed: unknown;
    await act(async () => {
      renamed = await result.current.renameCategory('cat-a', 'Renamed A');
    });

    expect(renamed).toBe(false);
    expect(result.current.isRenaming).toBe(false);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not rename this collection. Please try again.',
    );
    expect(consoleError).toHaveBeenCalledWith(
      'rename category',
      expect.objectContaining({ message: 'name taken' }),
    );
    consoleError.mockRestore();
  });
});

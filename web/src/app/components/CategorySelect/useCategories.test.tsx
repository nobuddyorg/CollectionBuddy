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

vi.mock('../../data/images', () => ({
  listImagePathsForItems: vi.fn(),
  removeImageObjects: vi.fn(),
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

  it('deletes the category row before touching any photograph, and cleans up on success', async () => {
    vi.mocked(deleteCategoryRow).mockResolvedValue({ error: null } as never);
    const { result } = renderHook(() => useCategories(), { wrapper });
    await act(async () => {
      await result.current.reload();
    });

    act(() => {
      result.current.deleteCategory('cat-1');
    });
    await commitDeferredDelete();

    await waitFor(() => expect(removeImageObjects).toHaveBeenCalledTimes(2));
    expect(deleteCategoryRow).toHaveBeenCalledWith('cat-1');
    expect(removeImageObjects).toHaveBeenCalledWith(['u/i1/a.webp']);
    expect(removeImageObjects).toHaveBeenCalledWith([
      'u/i2/b.webp',
      'u/i2/b.thumb.webp',
    ]);

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

    // Both orphaned items were attempted even though the first rejected --
    // a plain Promise.all would have stopped awaiting after that.
    await waitFor(() =>
      expect(removeImageObjects).toHaveBeenCalledWith([
        'u/i2/b.webp',
        'u/i2/b.thumb.webp',
      ]),
    );
    expect(removeImageObjects).toHaveBeenCalledWith(['u/i1/a.webp']);
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
    vi.mocked(listItemIdsLinkedElsewhere).mockResolvedValue({
      data: null,
      error: new Error('truncated page'),
    });
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
    expect(listItemIdsLinkedElsewhere).not.toHaveBeenCalled();
    expect(listImagePathsForItems).not.toHaveBeenCalled();
    expect(removeImageObjects).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
import { act, renderHook, screen } from '@testing-library/react';
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

// Regression (#306): the category delete used to remove every orphaned
// item's photographs *before* deleting the category row. A failed row
// delete (offline, 5xx) then left the category and its entries in place --
// with every photograph already, and irrecoverably, gone. Same shape as
// #C1 (item delete), fixed the same way: the row/cascade goes first, and
// storage bytes are only ever touched once that has actually succeeded.
// Reading the paths ahead of the row delete is a separate concern -- it's a
// read, not a mutation, so it's safe to run regardless of what the row
// delete goes on to do (see the "leaves every photograph untouched" test).
describe('useCategories deleteCategory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('lang', 'en');
    vi.mocked(listCategories).mockResolvedValue({
      data: [],
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

    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.deleteCategory('cat-1');
    });

    expect(outcome).toBe(true);
    expect(deleteCategoryRow).toHaveBeenCalledWith('cat-1');
    expect(removeImageObjects).toHaveBeenCalledWith(['u/i1/a.webp']);
    expect(removeImageObjects).toHaveBeenCalledWith([
      'u/i2/b.webp',
      'u/i2/b.thumb.webp',
    ]);
    expect(removeImageObjects).toHaveBeenCalledTimes(2);

    // The row delete is the first thing to actually mutate anything --
    // every byte removal is ordered strictly after it. Reading the paths is
    // not a mutation, so it's the one thing allowed to run before.
    const readOrder = vi.mocked(listImagePathsForItems).mock
      .invocationCallOrder[0];
    const rowOrder = vi.mocked(deleteCategoryRow).mock.invocationCallOrder[0];
    expect(readOrder).toBeLessThan(rowOrder);
    for (const call of vi.mocked(removeImageObjects).mock.invocationCallOrder) {
      expect(call).toBeGreaterThan(rowOrder);
    }

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // The old design resolved a uid once and reused it for every orphaned
  // item's storage.list() call (#385); this table-backed design has no uid
  // to resolve at all -- one batched query for every orphaned item's paths
  // replaces what used to be N Storage round trips.
  it("reads every orphaned item's image paths in one batched query, not once per item", async () => {
    vi.mocked(deleteCategoryRow).mockResolvedValue({ error: null } as never);
    const { result } = renderHook(() => useCategories(), { wrapper });

    await act(async () => {
      await result.current.deleteCategory('cat-1');
    });

    expect(listImagePathsForItems).toHaveBeenCalledTimes(1);
    expect(listImagePathsForItems).toHaveBeenCalledWith(['i1', 'i2']);
  });

  it('leaves every photograph untouched when the row delete fails, and reports the error', async () => {
    vi.mocked(deleteCategoryRow).mockResolvedValue({
      error: new Error('offline'),
    } as never);
    const { result } = renderHook(() => useCategories(), { wrapper });

    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.deleteCategory('cat-1');
    });

    expect(outcome).toBe(false);
    // The read still happened -- harmless either way -- but nothing that
    // acts on it did: not a single orphaned item's bytes were removed.
    expect(listImagePathsForItems).toHaveBeenCalledWith(['i1', 'i2']);
    expect(removeImageObjects).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not delete collection. Please try again.',
    );
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

    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.deleteCategory('cat-1');
    });

    // The row is already gone, irreversibly -- a cleanup failure is a
    // storage leak, not data loss, so the deletion still reports success.
    expect(outcome).toBe(true);
    expect(removeImageObjects).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This collection was deleted, but some of its photographs could not be removed and may still count against your storage.',
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
      await result.current.deleteCategory('cat-1');
    });

    // Both orphaned items were attempted even though the first rejected --
    // a plain Promise.all would have stopped awaiting after that.
    expect(removeImageObjects).toHaveBeenCalledWith(['u/i1/a.webp']);
    expect(removeImageObjects).toHaveBeenCalledWith([
      'u/i2/b.webp',
      'u/i2/b.thumb.webp',
    ]);
  });

  // #341: every test above sets listItemIdsLinkedElsewhere to return
  // nothing, so every one of them exercises "every item this category held
  // is orphaned" and none of them exercise the actual branch that keep/
  // filter arithmetic exists for -- an item linked to a second category,
  // which the cascade leaves alone and must not have its photographs
  // removed. Wrong here reads as "wrong is invisible": no error, just an
  // untouched item's photographs quietly deleted, or an orphan's silently
  // kept forever.
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
      await result.current.deleteCategory('cat-1');
    });

    expect(listItemIdsLinkedElsewhere).toHaveBeenCalledWith(
      ['i1', 'i2'],
      'cat-1',
    );
    expect(listImagePathsForItems).toHaveBeenCalledWith(['i2']);
    expect(removeImageObjects).toHaveBeenCalledWith([
      'u/i2/b.webp',
      'u/i2/b.thumb.webp',
    ]);
    expect(removeImageObjects).toHaveBeenCalledTimes(1);
  });

  // #409: pagination can only guarantee a *successful* answer is complete --
  // an incomplete one (an error mid-page, a chunk that failed) must still
  // stop the deletion rather than being treated as "nothing else links
  // these items". Aborting here means the category row itself must survive,
  // not just the photograph cleanup.
  it('aborts the entire deletion, including the category row, when the linked-elsewhere check fails', async () => {
    vi.mocked(listItemIdsLinkedElsewhere).mockResolvedValue({
      data: null,
      error: new Error('truncated page'),
    });
    const { result } = renderHook(() => useCategories(), { wrapper });

    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.deleteCategory('cat-1');
    });

    expect(outcome).toBe(false);
    expect(deleteCategoryRow).not.toHaveBeenCalled();
    expect(listImagePathsForItems).not.toHaveBeenCalled();
    expect(removeImageObjects).not.toHaveBeenCalled();
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
      await result.current.deleteCategory('cat-1');
    });

    expect(listItemIdsLinkedElsewhere).not.toHaveBeenCalled();
    expect(listImagePathsForItems).not.toHaveBeenCalled();
    expect(removeImageObjects).not.toHaveBeenCalled();
  });
});

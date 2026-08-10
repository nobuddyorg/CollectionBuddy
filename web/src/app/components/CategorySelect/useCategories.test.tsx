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
import { verifiedUserId } from '../../data/auth';
import { removeItemImages } from '../../data/images';
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
  removeItemImages: vi.fn(),
}));

vi.mock('../../data/auth', () => ({
  verifiedUserId: vi.fn(),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <ToastProvider>{children}</ToastProvider>
    </I18nProvider>
  );
}

// Regression (#306): the category delete used to remove every orphaned
// item's photographs *before* deleting the category row. A failed row
// delete (offline, 5xx) then left the category and its entries in place --
// with every photograph already, and irrecoverably, gone. Same shape as
// #C1 (item delete), fixed the same way: the row/cascade goes first, and
// storage bytes are only ever touched once that has actually succeeded.
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
    vi.mocked(removeItemImages).mockResolvedValue('uid');
    vi.mocked(verifiedUserId).mockResolvedValue('uid');
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
    expect(removeItemImages).toHaveBeenCalledWith('i1', 'uid');
    expect(removeItemImages).toHaveBeenCalledWith('i2', 'uid');
    expect(removeItemImages).toHaveBeenCalledTimes(2);

    // The row delete is the first thing to actually mutate anything --
    // every image removal is ordered strictly after it.
    const rowOrder = vi.mocked(deleteCategoryRow).mock.invocationCallOrder[0];
    for (const call of vi.mocked(removeItemImages).mock.invocationCallOrder) {
      expect(call).toBeGreaterThan(rowOrder);
    }

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // #385: removeItemImages used to resolve the uid itself, once per
  // orphaned item -- a round trip to the auth server that couldn't have
  // answered differently between them. It's resolved once here instead and
  // handed to every call.
  it('resolves the uid once and reuses it for every orphaned item, not once per item', async () => {
    vi.mocked(deleteCategoryRow).mockResolvedValue({ error: null } as never);
    const { result } = renderHook(() => useCategories(), { wrapper });

    await act(async () => {
      await result.current.deleteCategory('cat-1');
    });

    expect(verifiedUserId).toHaveBeenCalledTimes(1);
    expect(removeItemImages).toHaveBeenCalledWith('i1', 'uid');
    expect(removeItemImages).toHaveBeenCalledWith('i2', 'uid');
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
    // Nothing was removed: not a single orphaned item's images were
    // touched, let alone all of them.
    expect(removeItemImages).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not delete category. Please try again.',
    );
  });

  it('reports a cleanup failure without undoing the already-successful row delete', async () => {
    vi.mocked(deleteCategoryRow).mockResolvedValue({ error: null } as never);
    vi.mocked(removeItemImages)
      .mockResolvedValueOnce('uid')
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
    expect(removeItemImages).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This category was deleted, but some of its photographs could not be removed and may still count against your storage.',
    );
    consoleError.mockRestore();
  });

  it('does not let one failed image removal stop the rest from being attempted', async () => {
    vi.mocked(deleteCategoryRow).mockResolvedValue({ error: null } as never);
    vi.mocked(removeItemImages)
      .mockRejectedValueOnce(new Error('storage down'))
      .mockResolvedValueOnce('uid');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useCategories(), { wrapper });

    await act(async () => {
      await result.current.deleteCategory('cat-1');
    });

    // Both orphaned items were attempted even though the first rejected --
    // a plain Promise.all would have stopped awaiting after that.
    expect(removeItemImages).toHaveBeenCalledWith('i1', 'uid');
    expect(removeItemImages).toHaveBeenCalledWith('i2', 'uid');
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
    expect(removeItemImages).toHaveBeenCalledWith('i2', 'uid');
    expect(removeItemImages).not.toHaveBeenCalledWith('i1', 'uid');
    expect(removeItemImages).toHaveBeenCalledTimes(1);
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
    expect(removeItemImages).not.toHaveBeenCalled();
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
    expect(removeItemImages).not.toHaveBeenCalled();
  });
});

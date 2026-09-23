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
describe('useCategories deleteCategory orphan detection', () => {
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
    expect(result.current.categories).toEqual([CAT_1]);
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
    expect(result.current.categories).toEqual([CAT_1]);
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
});

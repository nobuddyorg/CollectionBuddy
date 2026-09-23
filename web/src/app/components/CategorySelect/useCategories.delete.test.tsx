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
    expect(result.current.categories).toEqual([CAT_1]);
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
    expect(result.current.categories).toEqual([CAT_1]);
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

    expect(result.current.categories).toEqual([CAT_2]);
    expect(deleteCategoryRow).toHaveBeenCalledTimes(1);
    await act(async () => {
      release?.();
    });
  });

  // onLeave shares this path but does not always pass onRestore; undo must not crash without it.
  it('tolerates an undo when options carry no onRestore callback', async () => {
    const { result } = renderHook(() => useCategories(), { wrapper });
    await act(async () => {
      await result.current.reload();
    });

    act(() => {
      result.current.deleteCategory('cat-1', {});
    });

    await screen.findByRole('status');
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(result.current.categories).toEqual([CAT_1]);
    expect(deleteCategoryRow).not.toHaveBeenCalled();
  });

  it('calls options.onRestore once an undo restores the category', async () => {
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
    expect(result.current.categories).toEqual([CAT_1]);
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

// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SELECTED_CATEGORY_KEY } from './components/CategorySelect/selection';
import { useCategories } from './components/CategorySelect/useCategories';
import { prefetchFirstPage } from './components/ItemList/firstPagePrefetch';
import { useCatalogue } from './useCatalogue';
import type { UseCategories } from './components/CategorySelect/useCategories';

vi.mock('./components/CategorySelect/useCategories', () => ({
  useCategories: vi.fn(),
}));

vi.mock('./components/ItemList/firstPagePrefetch', () => ({
  prefetchFirstPage: vi.fn(),
}));

const categories = [
  { id: 'a', name: 'Coins', user_id: 'owner-1' },
  { id: 'b', name: 'Stamps', user_id: 'owner-1' },
];

function categoriesState(
  overrides: Partial<UseCategories> = {},
): UseCategories {
  return {
    cats: categories,
    isLoading: false,
    isCreating: false,
    isDeleting: false,
    isRenaming: false,
    reload: vi.fn().mockResolvedValue(categories),
    createCategory: vi.fn(),
    renameCategory: vi.fn(),
    deleteCategory: vi.fn(),
    optimisticRemove: vi.fn(() => vi.fn()),
    ...overrides,
  };
}

describe('useCatalogue', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(prefetchFirstPage).mockClear();
    vi.mocked(useCategories).mockReturnValue(categoriesState());
  });

  it("starts the stored category's first page alongside the category list, not after it", () => {
    window.localStorage.setItem(SELECTED_CATEGORY_KEY, 'b');
    const reload = vi.fn(() => new Promise<typeof categories>(() => {}));
    vi.mocked(useCategories).mockReturnValue(categoriesState({ reload }));

    renderHook(() => useCatalogue(false, 'user-1'));

    // The list has not answered (and never will here), yet the page is on its way.
    expect(reload).toHaveBeenCalled();
    expect(prefetchFirstPage).toHaveBeenCalledWith('b');
  });

  it('prefetches nothing when no category was stored', () => {
    renderHook(() => useCatalogue(false, 'user-1'));

    expect(prefetchFirstPage).not.toHaveBeenCalled();
  });

  it('prefetches nothing before the session has resolved', () => {
    window.localStorage.setItem(SELECTED_CATEGORY_KEY, 'b');

    renderHook(() => useCatalogue(true, 'user-1'));

    expect(prefetchFirstPage).not.toHaveBeenCalled();
  });

  it('does not load while the session is still resolving', () => {
    const reload = vi.fn().mockResolvedValue(categories);
    vi.mocked(useCategories).mockReturnValue(categoriesState({ reload }));

    renderHook(() => useCatalogue(true, 'user-1'));
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not load without a signed-in user', () => {
    const reload = vi.fn().mockResolvedValue(categories);
    vi.mocked(useCategories).mockReturnValue(categoriesState({ reload }));

    renderHook(() => useCatalogue(false, undefined));
    expect(reload).not.toHaveBeenCalled();
  });

  it('loads and auto-selects the first category once a user is present', async () => {
    const { result } = renderHook(() => useCatalogue(false, 'user-1'));

    await waitFor(() => expect(result.current.catalogueReady).toBe(true));
    expect(result.current.selectedCategoryId).toBe('a');
  });

  it('opens the remembered category instead of the first one', async () => {
    window.localStorage.setItem(SELECTED_CATEGORY_KEY, 'b');

    const { result } = renderHook(() => useCatalogue(false, 'user-1'));

    await waitFor(() => expect(result.current.catalogueReady).toBe(true));
    expect(result.current.selectedCategoryId).toBe('b');
  });

  it('keeps an already-chosen selection rather than re-picking one', async () => {
    const { result } = renderHook(() => useCatalogue(false, 'user-1'));

    act(() => result.current.selectCategory('b'));
    await waitFor(() => expect(result.current.catalogueReady).toBe(true));
    expect(result.current.selectedCategoryId).toBe('b');
  });

  // Gated on the session, so it must run again when the session resolves, not only on first render.
  it('loads once the session stops resolving, not only on first render', async () => {
    const reload = vi.fn().mockResolvedValue(categories);
    vi.mocked(useCategories).mockReturnValue(categoriesState({ reload }));
    const { rerender, result } = renderHook(
      ({ loading }: { loading: boolean }) => useCatalogue(loading, 'user-1'),
      { initialProps: { loading: true } },
    );
    expect(reload).not.toHaveBeenCalled();

    rerender({ loading: false });

    await waitFor(() => expect(result.current.catalogueReady).toBe(true));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  // Naming it in another callback's dependency array has to be free.
  it('keeps one selectCategory across re-renders', () => {
    const { result, rerender } = renderHook(() =>
      useCatalogue(false, 'user-1'),
    );
    const first = result.current.selectCategory;

    rerender();

    expect(result.current.selectCategory).toBe(first);
  });

  it('selecting a category persists it for the next visit', () => {
    const { result } = renderHook(() => useCatalogue(false, 'user-1'));

    act(() => result.current.selectCategory('b'));
    expect(window.localStorage.getItem(SELECTED_CATEGORY_KEY)).toBe('b');

    act(() => result.current.selectCategory(null));
    expect(window.localStorage.getItem(SELECTED_CATEGORY_KEY)).toBeNull();
  });
});

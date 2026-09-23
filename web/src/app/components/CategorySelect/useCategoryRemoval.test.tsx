// @vitest-environment jsdom
import { renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ConfirmProvider } from '../Confirm/ConfirmProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import { countItemsForCategory } from '../../data/categories';
import type { Category } from '../../types';
import { useCategoryRemoval } from './useCategoryRemoval';
import type { UseCategories } from './useCategories';
import type { UseShares } from './useShares';

vi.mock('../../data/categories', () => ({
  countItemsForCategory: vi.fn(),
}));

const CATEGORIES: Category[] = [
  { id: 'a', name: 'Coins', user_id: 'owner-1' },
  { id: 'b', name: 'Stamps', user_id: 'owner-1' },
];

function categories(overrides: Partial<UseCategories> = {}): UseCategories {
  return {
    cats: CATEGORIES,
    isLoading: false,
    isCreating: false,
    isDeleting: false,
    isRenaming: false,
    reload: vi.fn().mockResolvedValue(CATEGORIES),
    createCategory: vi.fn(),
    renameCategory: vi.fn(),
    deleteCategory: vi.fn(),
    // Hands back a restore function, as the real one does.
    optimisticRemove: vi.fn(() => vi.fn()),
    ...overrides,
  };
}

function shares(overrides: Partial<UseShares> = {}): UseShares {
  return {
    shares: [],
    isLoading: false,
    isSharing: false,
    isRevoking: false,
    isUpdatingRole: false,
    reload: vi.fn().mockResolvedValue([]),
    createShare: vi.fn(),
    deleteShare: vi.fn(),
    updateShareRole: vi.fn(),
    ...overrides,
  };
}

function setUp({
  selectedCategoryId = 'a' as string | null,
  selected = CATEGORIES[0] as Category | null,
  categoriesState = categories(),
  sharesState = shares(),
}) {
  const onSelect = vi.fn();
  // The confirm dialog renders through the provider, so the hook needs a real tree around it.
  const { result, rerender } = renderHook(
    (props: {
      selectedCategoryId: string | null;
      selected: Category | null;
      categoriesState: UseCategories;
      sharesState: UseShares;
    }) =>
      useCategoryRemoval({
        selectedCategoryId: props.selectedCategoryId,
        selected: props.selected,
        sortedCategories: CATEGORIES,
        categories: props.categoriesState,
        shares: props.sharesState,
        onSelect,
      }),
    {
      initialProps: {
        selectedCategoryId,
        selected,
        categoriesState,
        sharesState,
      },
      wrapper: ({ children }) => (
        <I18nProvider>
          <ToastProvider>
            <ConfirmProvider>{children}</ConfirmProvider>
          </ToastProvider>
        </I18nProvider>
      ),
    },
  );
  return { result, onSelect, rerender };
}

describe('useCategoryRemoval deleting a category you own', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('lang', 'en');
    vi.mocked(countItemsForCategory).mockResolvedValue({
      count: 0,
      error: null,
    } as never);
  });

  it('falls through to what is left and deletes it once the warning is accepted', async () => {
    const deleteCategory = vi.fn<UseCategories['deleteCategory']>();
    const { result, onSelect } = setUp({
      categoriesState: categories({ deleteCategory }),
    });

    void result.current.onDelete();
    await userEvent.click(await screen.findByTestId('confirm-accept'));

    // The selection moves before the delete, so the catalogue never shows a category on its way out.
    expect(onSelect).toHaveBeenCalledWith('b');
    expect(deleteCategory).toHaveBeenCalledWith('a', expect.anything());
  });

  it('falls back to the generic warning and logs when the item count cannot be read', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const countError = new Error('rls');
    vi.mocked(countItemsForCategory).mockResolvedValue({
      count: null,
      error: countError,
    } as never);
    const { result } = setUp({});

    void result.current.onDelete();

    expect(
      await screen.findByText(
        'Delete "Coins"? Its entries and all their photographs will be permanently deleted.',
      ),
    ).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith(countError);
    consoleError.mockRestore();
  });

  it('does not log anything once the item count reads successfully', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const { result } = setUp({});

    void result.current.onDelete();
    await screen.findByTestId('confirm-accept');

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('falls back to the generic warning when the count answers null with no error', async () => {
    vi.mocked(countItemsForCategory).mockResolvedValue({
      count: null,
      error: null,
    } as never);
    const { result } = setUp({});

    void result.current.onDelete();

    expect(
      await screen.findByText(
        'Delete "Coins"? Its entries and all their photographs will be permanently deleted.',
      ),
    ).toBeInTheDocument();
  });

  it('names the entry count in the warning when the category holds entries', async () => {
    vi.mocked(countItemsForCategory).mockResolvedValue({
      count: 3,
      error: null,
    } as never);
    const { result } = setUp({});

    void result.current.onDelete();

    expect(
      await screen.findByText(
        'Delete "Coins"? Its 3 entries and all their photographs will be permanently deleted.',
      ),
    ).toBeInTheDocument();
  });

  it('deletes nothing when the warning is declined', async () => {
    const deleteCategory = vi.fn<UseCategories['deleteCategory']>();
    const { result, onSelect } = setUp({
      categoriesState: categories({ deleteCategory }),
    });

    void result.current.onDelete();
    await userEvent.click(await screen.findByTestId('confirm-cancel'));

    expect(deleteCategory).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  // The row comes back on failure, and the selection has to come with it.
  it('re-selects the category when the delete is undone or fails', async () => {
    const deleteCategory = vi.fn<UseCategories['deleteCategory']>();
    const { result, onSelect } = setUp({
      categoriesState: categories({ deleteCategory }),
    });

    void result.current.onDelete();
    await userEvent.click(await screen.findByTestId('confirm-accept'));

    deleteCategory.mock.calls[0]?.[1]?.onRestore?.();
    expect(onSelect).toHaveBeenLastCalledWith('a');
  });

  it('does nothing at all without a selection', async () => {
    const { result, onSelect } = setUp({
      selectedCategoryId: null,
      selected: null,
    });

    await result.current.onDelete();

    expect(countItemsForCategory).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('deletes whichever category is selected after a re-render, not a stale one', async () => {
    const deleteCategory = vi.fn<UseCategories['deleteCategory']>();
    const { result, rerender } = setUp({
      categoriesState: categories({ deleteCategory }),
    });

    rerender({
      selectedCategoryId: 'b',
      selected: CATEGORIES[1],
      categoriesState: categories({ deleteCategory }),
      sharesState: shares(),
    });

    void result.current.onDelete();
    await userEvent.click(await screen.findByTestId('confirm-accept'));

    expect(deleteCategory).toHaveBeenCalledWith('b', expect.anything());
  });

  it('falls back to an empty name when the category is gone from the list', async () => {
    const deleteCategory = vi.fn<UseCategories['deleteCategory']>();
    const { result } = setUp({
      selected: null,
      categoriesState: categories({ deleteCategory }),
    });

    void result.current.onDelete();

    expect(await screen.findByText('Delete ""?')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('confirm-cancel'));
    expect(deleteCategory).not.toHaveBeenCalled();
  });
});

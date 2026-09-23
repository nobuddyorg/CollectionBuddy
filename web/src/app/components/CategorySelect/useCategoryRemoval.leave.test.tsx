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
    categories: CATEGORIES,
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

const myGrant = {
  id: 'share-1',
  invited_email: 'me@example.com',
  expires_at: null,
  owner_user_id: 'other-owner',
  role: 'viewer' as const,
};

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

describe('useCategoryRemoval leaving a category shared with you', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('lang', 'en');
    vi.mocked(countItemsForCategory).mockResolvedValue({
      count: 0,
      error: null,
    } as never);
  });

  it('ends only this grant, and falls through to what is left', async () => {
    const deleteShare = vi.fn<UseShares['deleteShare']>();
    const deleteCategory = vi.fn<UseCategories['deleteCategory']>();
    const { result, onSelect } = setUp({
      categoriesState: categories({ deleteCategory }),
      sharesState: shares({ shares: [myGrant], deleteShare }),
    });

    void result.current.onLeave();
    await userEvent.click(await screen.findByTestId('confirm-accept'));

    expect(deleteShare).toHaveBeenCalledWith('share-1', expect.anything());
    expect(deleteCategory).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('ends whichever grant is current after a re-render, not a stale one', async () => {
    const deleteShare = vi.fn<UseShares['deleteShare']>();
    const { result, rerender } = setUp({
      categoriesState: categories(),
      sharesState: shares({ shares: [myGrant], deleteShare }),
    });

    const otherGrant = { ...myGrant, id: 'share-2' };
    rerender({
      selectedCategoryId: 'b',
      selected: CATEGORIES[1],
      categoriesState: categories(),
      sharesState: shares({ shares: [otherGrant], deleteShare }),
    });

    void result.current.onLeave();
    await userEvent.click(await screen.findByTestId('confirm-accept'));

    expect(deleteShare).toHaveBeenCalledWith('share-2', expect.anything());
  });

  it('puts the category back and re-selects it when leaving fails', async () => {
    const restoreCategory = vi.fn();
    const deleteShare = vi.fn<UseShares['deleteShare']>();
    const { result, onSelect } = setUp({
      categoriesState: categories({
        optimisticRemove: vi.fn(() => restoreCategory),
      }),
      sharesState: shares({ shares: [myGrant], deleteShare }),
    });

    void result.current.onLeave();
    await userEvent.click(await screen.findByTestId('confirm-accept'));

    deleteShare.mock.calls[0]?.[1]?.onRestore?.();
    expect(restoreCategory).toHaveBeenCalled();
    expect(onSelect).toHaveBeenLastCalledWith('a');
  });

  // Without the one row RLS hands a grantee there is nothing to delete; the category is not the fallback.
  it('does nothing when no grant row has loaded yet', async () => {
    const deleteShare = vi.fn<UseShares['deleteShare']>();
    const { result, onSelect } = setUp({
      sharesState: shares({ deleteShare }),
    });

    await result.current.onLeave();

    expect(deleteShare).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByTestId('confirm-accept')).not.toBeInTheDocument();
  });

  it('stops short of a confirmation when the category is gone from the list', async () => {
    const { result } = setUp({
      selected: null,
      sharesState: shares({ shares: [myGrant] }),
    });

    await result.current.onLeave();

    expect(screen.queryByTestId('confirm-accept')).not.toBeInTheDocument();
  });

  it('does not end the grant when the leave confirmation is declined', async () => {
    const deleteShare = vi.fn<UseShares['deleteShare']>();
    const { result, onSelect } = setUp({
      sharesState: shares({ shares: [myGrant], deleteShare }),
    });

    void result.current.onLeave();
    await userEvent.click(await screen.findByTestId('confirm-cancel'));

    expect(deleteShare).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  // Already gone (another tab, a second click) leaves nothing to undo, so nothing to end either.
  it('does not end the grant when the category was already removed', async () => {
    const deleteShare = vi.fn<UseShares['deleteShare']>();
    const { result } = setUp({
      categoriesState: categories({
        optimisticRemove: vi.fn(() => null),
      }),
      sharesState: shares({ shares: [myGrant], deleteShare }),
    });

    void result.current.onLeave();
    await userEvent.click(await screen.findByTestId('confirm-accept'));

    expect(deleteShare).not.toHaveBeenCalled();
  });
});

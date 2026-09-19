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

const cats: Category[] = [
  { id: 'a', name: 'Coins', user_id: 'owner-1' },
  { id: 'b', name: 'Stamps', user_id: 'owner-1' },
];

function categories(overrides: Partial<UseCategories> = {}): UseCategories {
  return {
    cats,
    isLoading: false,
    isCreating: false,
    isDeleting: false,
    isRenaming: false,
    reload: vi.fn().mockResolvedValue(cats),
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
  selectedCat = 'a' as string | null,
  selected = cats[0] as Category | null,
  categoriesState = categories(),
  sharesState = shares(),
}) {
  const onSelect = vi.fn();
  // The confirm dialog renders through the provider, so the hook needs a
  // real tree around it rather than a bare renderHook.
  const { result, rerender } = renderHook(
    (props: {
      selectedCat: string | null;
      selected: Category | null;
      categoriesState: UseCategories;
      sharesState: UseShares;
    }) =>
      useCategoryRemoval({
        selectedCat: props.selectedCat,
        selected: props.selected,
        sortedCats: cats,
        categories: props.categoriesState,
        shares: props.sharesState,
        onSelect,
      }),
    {
      initialProps: { selectedCat, selected, categoriesState, sharesState },
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

describe('useCategoryRemoval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('lang', 'en');
    vi.mocked(countItemsForCategory).mockResolvedValue({
      count: 0,
      error: null,
    } as never);
  });

  describe('deleting a category you own', () => {
    it('falls through to what is left and deletes it once the warning is accepted', async () => {
      const deleteCategory = vi.fn<UseCategories['deleteCategory']>();
      const { result, onSelect } = setUp({
        categoriesState: categories({ deleteCategory }),
      });

      void result.current.onDelete();
      await userEvent.click(await screen.findByTestId('confirm-accept'));

      // The selection moves before the delete, so the catalogue below is
      // never briefly showing a category that is on its way out.
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
      const { result, onSelect } = setUp({ selectedCat: null, selected: null });

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
        selectedCat: 'b',
        selected: cats[1],
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

  describe('leaving a category shared with you', () => {
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
        selectedCat: 'b',
        selected: cats[1],
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

    // A grantee's own row is the only one RLS hands back to them, so
    // without it there is nothing to delete -- and deleting the category
    // is not the fallback.
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

    // Already gone -- another tab, or a second click -- leaves nothing to
    // undo, and so nothing to end either.
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
});

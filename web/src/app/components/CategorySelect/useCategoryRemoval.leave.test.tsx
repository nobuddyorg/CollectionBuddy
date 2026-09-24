// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UseCategories } from './useCategories';
import type { UseShares } from './useShares';
import {
  CATEGORIES,
  categories,
  installEmptyCountMock,
  setUp,
  shares,
} from './useCategoryRemoval.test-support';

vi.mock('../../data/categories', () => ({
  countItemsForCategory: vi.fn(),
}));

const myGrant = {
  id: 'share-1',
  invited_email: 'me@example.com',
  expires_at: null,
  owner_user_id: 'other-owner',
  role: 'viewer' as const,
};

describe('useCategoryRemoval leaving a category shared with you', () => {
  beforeEach(installEmptyCountMock);

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

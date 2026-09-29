'use client';

import { useCallback } from 'react';

import { countItemsForCategory } from '../../data/categories';
import { useConfirm } from '../Confirm/ConfirmProvider';
import { useI18n } from '../../i18n/useI18n';
import type { Category } from '../../types';
import { nextAfterRemoving } from './selection';
import type { UseCategories } from './useCategories';
import type { UseShares } from './useShares';

/** Owner: the trash destroys the category; grantee: it only ends this viewer's own access. */
export function useCategoryRemoval({
  selected,
  sortedCategories,
  categories,
  shares,
  onSelect,
}: {
  selected: Category | null;
  sortedCategories: Category[];
  categories: UseCategories;
  shares: UseShares;
  onSelect: (id: string | null) => void;
}) {
  const { t, tCount } = useI18n();
  const confirm = useConfirm();
  const { deleteCategory, optimisticRemove } = categories;

  // shares.shares[0] is the one category_shares row RLS ever hands back to a non-owner.
  const onLeave = useCallback(async () => {
    if (!selected) return;
    const myShareId = shares.shares[0]?.id;
    if (!myShareId) return;

    const message = t('category_select.confirm_leave', { name: selected.name });
    if (!(await confirm(message))) return;

    const restoreCategory = optimisticRemove(selected.id);
    if (!restoreCategory) return;
    onSelect(nextAfterRemoving(sortedCategories, selected.id));

    if (await shares.leaveShare(myShareId)) return;
    restoreCategory();
    onSelect(selected.id);
  }, [
    selected,
    shares,
    t,
    confirm,
    onSelect,
    sortedCategories,
    optimisticRemove,
  ]);

  const onDelete = useCallback(async () => {
    if (!selected) return;

    const { count, error: countError } = await countItemsForCategory(
      selected.id,
    );
    if (countError) console.error(countError);
    let message;
    if (countError || count == null) {
      message = t('category_select.confirm_delete_generic', {
        name: selected.name,
      });
    } else if (count > 0) {
      message = tCount('category_select.confirm_delete_with_entries', {
        name: selected.name,
        count,
      });
    } else {
      message = t('category_select.confirm_delete_empty', {
        name: selected.name,
      });
    }

    if (!(await confirm(message))) return;
    onSelect(nextAfterRemoving(sortedCategories, selected.id));
    deleteCategory(selected.id, {
      onRestore: () => onSelect(selected.id),
    });
  }, [
    selected,
    deleteCategory,
    onSelect,
    sortedCategories,
    t,
    tCount,
    confirm,
  ]);

  return { onDelete, onLeave };
}

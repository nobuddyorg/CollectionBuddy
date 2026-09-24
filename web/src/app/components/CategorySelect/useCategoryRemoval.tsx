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
  selectedCategoryId,
  selected,
  sortedCategories,
  categories,
  shares,
  onSelect,
}: {
  selectedCategoryId: string | null;
  selected: Category | null;
  sortedCategories: Category[];
  categories: UseCategories;
  shares: UseShares;
  onSelect: (id: string | null) => void;
}) {
  const { t } = useI18n();
  const confirm = useConfirm();
  const { deleteCategory, optimisticRemove } = categories;

  // shares.shares[0] is the one category_shares row RLS ever hands back to a non-owner.
  const onLeave = useCallback(async () => {
    if (!selectedCategoryId || !selected) return;
    const myShareId = shares.shares[0]?.id;
    if (!myShareId) return;

    const message = t('category_select.confirm_leave').replace(
      '{name}',
      selected.name,
    );
    if (!(await confirm(message))) return;

    const restoreCategory = optimisticRemove(selectedCategoryId);
    if (!restoreCategory) return;
    onSelect(nextAfterRemoving(sortedCategories, selectedCategoryId));

    shares.deleteShare(myShareId, {
      successMessage: t('category_select.leave_success'),
      errorMessage: t('category_select.leave_error'),
      onRestore: () => {
        restoreCategory();
        onSelect(selectedCategoryId);
      },
    });
  }, [
    selectedCategoryId,
    selected,
    shares,
    t,
    confirm,
    onSelect,
    sortedCategories,
    optimisticRemove,
  ]);

  const onDelete = useCallback(async () => {
    if (!selectedCategoryId) return;
    const categoryName = selected?.name ?? '';

    const { count, error: countError } =
      await countItemsForCategory(selectedCategoryId);
    if (countError) console.error(countError);
    let message;
    if (countError || count == null) {
      message = t('category_select.confirm_delete_generic').replace(
        '{name}',
        categoryName,
      );
    } else if (count > 0) {
      message = t('category_select.confirm_delete_with_entries')
        .replace('{name}', categoryName)
        .replace('{count}', String(count));
    } else {
      message = t('category_select.confirm_delete_empty').replace(
        '{name}',
        categoryName,
      );
    }

    if (!(await confirm(message))) return;
    onSelect(nextAfterRemoving(sortedCategories, selectedCategoryId));
    deleteCategory(selectedCategoryId, {
      onRestore: () => onSelect(selectedCategoryId),
    });
  }, [
    selectedCategoryId,
    selected,
    deleteCategory,
    onSelect,
    sortedCategories,
    t,
    confirm,
  ]);

  return { onDelete, onLeave };
}

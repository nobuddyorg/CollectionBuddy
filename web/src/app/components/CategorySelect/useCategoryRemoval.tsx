'use client';

import { useCallback } from 'react';

import { countItemsForCategory } from '../../data/categories';
import { useConfirm } from '../Confirm/ConfirmProvider';
import { useI18n } from '../../i18n/useI18n';
import type { Category } from '../../types';
import { nextAfterRemoving } from './selection';
import type { UseCategories } from './useCategories';
import type { UseShares } from './useShares';

/**
 * The two ways a category can leave the panel, behind one trash button:
 * owning it means the button destroys it, being a grantee means it only
 * ends this viewer's own access. Which one runs is the caller's decision
 * (`isShared` in index.tsx); both end with the selection falling through to
 * whatever is left rather than back to no selection at all.
 */
export function useCategoryRemoval({
  selectedCat,
  selected,
  sortedCats,
  categories,
  shares,
  onSelect,
}: {
  selectedCat: string | null;
  selected: Category | null;
  sortedCats: Category[];
  categories: UseCategories;
  shares: UseShares;
  onSelect: (id: string | null) => void;
}) {
  const { t } = useI18n();
  const confirm = useConfirm();
  const { deleteCategory, optimisticRemove } = categories;

  // Ends this viewer's access via deleteShare on shares.shares[0] -- the one
  // row RLS ever hands back to a non-owner.
  const onLeave = useCallback(async () => {
    if (!selectedCat || !selected) return;
    const myShareId = shares.shares[0]?.id;
    if (!myShareId) return;

    const message = t('category_select.confirm_leave').replace(
      '{name}',
      selected.name,
    );
    if (!(await confirm(message))) return;

    const restoreCategory = optimisticRemove(selectedCat);
    if (!restoreCategory) return;
    onSelect(nextAfterRemoving(sortedCats, selectedCat));

    shares.deleteShare(myShareId, {
      successMessage: t('category_select.leave_success'),
      errorMessage: t('category_select.leave_error'),
      onRestore: () => {
        restoreCategory();
        onSelect(selectedCat);
      },
    });
  }, [
    selectedCat,
    selected,
    shares,
    t,
    confirm,
    onSelect,
    sortedCats,
    optimisticRemove,
  ]);

  const onDelete = useCallback(async () => {
    if (!selectedCat) return;
    const categoryName = selected?.name ?? '';

    // Named and counted rather than a bare "Confirm deletion": the trash
    // sits right beside the rename field, and deletion is permanent.
    const { count, error: countError } =
      await countItemsForCategory(selectedCat);
    if (countError) console.error(countError);
    const message =
      countError || count == null
        ? t('category_select.confirm_delete_generic').replace(
            '{name}',
            categoryName,
          )
        : count > 0
          ? t('category_select.confirm_delete_with_entries')
              .replace('{name}', categoryName)
              .replace('{count}', String(count))
          : t('category_select.confirm_delete_empty').replace(
              '{name}',
              categoryName,
            );

    if (!(await confirm(message))) return;
    onSelect(nextAfterRemoving(sortedCats, selectedCat));
    deleteCategory(selectedCat, { onRestore: () => onSelect(selectedCat) });
  }, [selectedCat, selected, deleteCategory, onSelect, sortedCats, t, confirm]);

  return { onDelete, onLeave };
}

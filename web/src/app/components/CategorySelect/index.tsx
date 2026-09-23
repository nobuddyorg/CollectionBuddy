'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useI18n } from '../../i18n/useI18n';
import type { Category } from '../../types';
import {
  AddButton,
  CollapseButton,
  DeleteButtonWithLabel,
  ExpandButton,
  RenameButton,
} from './Buttons';
import { CategoryText } from './CategoryText';
import { CategorySelectDropdown } from './Dropdown';
import { CategoryInput } from './Input';
import { sortCategories } from './selection';
import { SharingSection } from './Sharing';
import { ExportRow, ImportRow } from './TransferRows';
import type { UseCategories } from './useCategories';
import { useCategoryRemoval } from './useCategoryRemoval';
import { useExportCategory } from './useExportCategory';
import { useImportCategory } from './useImportCategory';
import { useShares } from './useShares';
import { fieldClasses } from '../ui/fieldClasses';
import { labelClasses } from '../ui/labelClasses';
import { MAX_CATEGORY_NAME_LENGTH } from '../../lib/textLimits';

type Props = {
  selectedCat: string | null;
  onSelect: (id: string | null) => void;
  categories: UseCategories;
  userId: string | null;
  /** False until the page's initial load resolves; stops a one-render "None selected" flash. */
  ready?: boolean;
};

export default function CategorySelect({
  selectedCat: selectedCategoryId,
  onSelect,
  categories,
  userId,
  ready = true,
}: Props) {
  const { t } = useI18n();
  const {
    cats: categoryList,
    isLoading,
    isCreating,
    isDeleting,
    isRenaming,
    reload,
    createCategory,
    renameCategory,
  } = categories;
  const {
    isExporting,
    message: exportMessage,
    runExport,
    cancelExport,
  } = useExportCategory();
  const existingCategoryNames = useMemo(
    () => categoryList.map((category) => category.name),
    [categoryList],
  );
  const {
    isImporting,
    message: importMessage,
    runImport,
    cancelImport,
  } = useImportCategory(existingCategoryNames);
  const [name, setName] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [expanded, setExpanded] = useState(!selectedCategoryId);

  // Render-time transition, not an effect: no extra render between selection change and collapse.
  const [previousSelectedCategoryId, setPreviousSelectedCategoryId] =
    useState(selectedCategoryId);
  if (selectedCategoryId !== previousSelectedCategoryId) {
    setPreviousSelectedCategoryId(selectedCategoryId);
    setExpanded(!selectedCategoryId);
  }

  // Same order the page picks "the first category" from, so the tab it opens on reads as first.
  const sortedCategories = useMemo(
    () => sortCategories(categoryList),
    [categoryList],
  );

  const selected = useMemo<Category | null>(
    () =>
      selectedCategoryId
        ? (categoryList.find(
            (category) => category.id === selectedCategoryId,
          ) ?? null)
        : null,
    [categoryList, selectedCategoryId],
  );

  // listCategories() returns owned and shared rows alike; user_id is what tells them apart.
  const isShared = !!selected && !!userId && selected.user_id !== userId;

  // For an owned category every grant; for a shared one the viewer's own single row, which onLeave needs.
  const shares = useShares(selectedCategoryId);
  const { reload: reloadShares } = shares;
  useEffect(() => {
    if (expanded && selectedCategoryId) void reloadShares();
  }, [expanded, selectedCategoryId, reloadShares]);

  // Render-time transition, not an effect: the rename field never lags the selection by a render.
  const [syncedName, setSyncedName] = useState<string | null>(null);
  if (selected && selected.name !== syncedName) {
    setSyncedName(selected.name);
    setRenameValue(selected.name);
  }

  const renameIsDirty =
    !!selected &&
    renameValue.trim() !== '' &&
    renameValue.trim() !== selected.name;

  const onRename = useCallback(async () => {
    if (!selectedCategoryId || !renameIsDirty) return;
    await renameCategory(selectedCategoryId, renameValue);
  }, [selectedCategoryId, renameIsDirty, renameCategory, renameValue]);

  const onCreate = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const created = await createCategory(trimmed);
    if (created?.id) {
      setName('');
      onSelect(created.id);
      setExpanded(false);
    }
  }, [name, createCategory, onSelect]);

  const onImportFile = useCallback(
    async (file: File) => {
      // reload() must resolve before onSelect, or the imported category is not yet there to select.
      await runImport(file, (categoryId) => {
        void reload().then(() => onSelect(categoryId));
      });
    },
    [runImport, reload, onSelect],
  );

  const { onDelete, onLeave } = useCategoryRemoval({
    selectedCategoryId,
    selected,
    sortedCategories,
    categories,
    shares,
    onSelect,
  });

  return (
    <section className="space-y-3">
      {/* One heading in both states, so toggling the panel never shifts the header. */}
      <div className="flex items-end justify-between gap-3 border-b border-border pb-3">
        <CategoryText
          title={t('category_select.title')}
          name={selected ? selected.name : t('category_select.none_selected')}
          placeholder={!selected}
          loading={!ready}
        />
        {/* No toggle until a category exists: nothing to collapse to on first run. */}
        {selected &&
          (expanded ? (
            <CollapseButton
              onClick={() => setExpanded(false)}
              label={t('common.close')}
            />
          ) : (
            <ExpandButton
              onClick={() => setExpanded(true)}
              label={t('category_select.open_category')}
            />
          ))}
      </div>

      {expanded && (
        <>
          <CategorySelectDropdown
            selectedCategoryId={selectedCategoryId}
            onSelect={onSelect}
            sortedCategories={sortedCategories}
            isLoading={isLoading}
            setExpanded={setExpanded}
            userId={userId}
          />

          {/* One grid for both rows, so the fields line up despite the rename row's extra button. */}
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 gap-y-1.5">
            {selected && (
              <>
                <label
                  htmlFor="rename-category"
                  className={labelClasses('col-span-3')}
                >
                  {t('category_select.rename')}
                </label>
                <input
                  id="rename-category"
                  data-testid="rename-category-input"
                  value={renameValue}
                  maxLength={MAX_CATEGORY_NAME_LENGTH}
                  // Disabled, not readOnly: readOnly keeps every visual cue of an editable field but typing.
                  disabled={isShared}
                  title={
                    isShared
                      ? t('category_select.shared_marker_label')
                      : undefined
                  }
                  onChange={(event) => setRenameValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void onRename();
                    if (event.key === 'Escape') {
                      // First Escape discards the edit; a second one (nothing left to discard) closes the panel.
                      if (renameValue !== selected.name) {
                        setRenameValue(selected.name);
                      } else {
                        setExpanded(false);
                      }
                    }
                  }}
                  className={fieldClasses('min-w-0 disabled:opacity-50')}
                />
                <RenameButton
                  onClick={() => void onRename()}
                  disabled={
                    !renameIsDirty || isRenaming || isExporting || isShared
                  }
                  label={t('category_select.rename_confirm')}
                />
                {/* Disabled during an export (it still reads the objects) and until a grantee's share row has loaded. */}
                <DeleteButtonWithLabel
                  onClick={() => void (isShared ? onLeave() : onDelete())}
                  disabled={
                    isDeleting ||
                    isExporting ||
                    (isShared && (shares.isLoading || shares.isRevoking))
                  }
                  label={t('category_select.delete')}
                />
              </>
            )}

            <label
              htmlFor="new-category-name"
              className={labelClasses(`col-span-3 ${selected ? 'mt-1.5' : ''}`)}
            >
              {t('category_select.new_category')}
            </label>
            <CategoryInput
              name={name}
              setName={setName}
              createCategory={() => void onCreate()}
              setExpanded={setExpanded}
            />
            <AddButton
              onClick={() => void onCreate()}
              disabled={name.trim() === '' || isCreating}
              isCreating={isCreating}
              label={t('category_select.add')}
            />
          </div>

          {/* Owner only: a grantee never sees who else the category is shared with. */}
          {selected && !isShared && <SharingSection shares={shares} />}

          <ImportRow
            isImporting={isImporting}
            message={importMessage}
            onFile={(file) => void onImportFile(file)}
            onCancel={cancelImport}
          />

          {/* Under its own rule, away from Delete: a thumb slip between the two would be destructive. */}
          {selected && (
            <ExportRow
              isExporting={isExporting}
              isShared={isShared}
              message={exportMessage}
              onExport={() => void runExport(selected)}
              onCancel={cancelExport}
            />
          )}

          {/* Bottom rule only while expanded; the collapsed header has its own border-b. */}
          <div aria-hidden="true" className="border-t border-border pt-3" />
        </>
      )}
    </section>
  );
}

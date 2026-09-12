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

type Props = {
  selectedCat: string | null;
  onSelect: (id: string | null) => void;
  categories: UseCategories;
  userId: string | null;
  /** False until the page's own initial load has resolved (see
   *  `catalogueReady` in page.tsx) -- keeps the header from showing "None
   *  selected" for one render before the real selection lands. */
  ready?: boolean;
};

export default function CategorySelect({
  selectedCat,
  onSelect,
  categories,
  userId,
  ready = true,
}: Props) {
  const { t } = useI18n();
  const {
    cats,
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
  const existingCategoryNames = useMemo(() => cats.map((c) => c.name), [cats]);
  const {
    isImporting,
    message: importMessage,
    runImport,
    cancelImport,
  } = useImportCategory(existingCategoryNames);
  const [name, setName] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [expanded, setExpanded] = useState(!selectedCat);

  // Collapses/expands in response to the selection changing (e.g. a
  // category getting deleted out from under it) without the extra
  // render-then-effect round trip a useEffect would add.
  const [prevSelectedCat, setPrevSelectedCat] = useState(selectedCat);
  if (selectedCat !== prevSelectedCat) {
    setPrevSelectedCat(selectedCat);
    setExpanded(!selectedCat);
  }

  // Initial load and auto-select of a lone category happen in the page, not
  // here -- it needs the answer to decide what renders below this strip.

  // The same order the page picks "the first category" from, so the tab it
  // opens on is the tab that reads as first.
  const sortedCats = useMemo(() => sortCategories(cats), [cats]);

  const selected = useMemo<Category | null>(
    () =>
      selectedCat ? (cats.find((c) => c.id === selectedCat) ?? null) : null,
    [cats, selectedCat],
  );

  // listCategories() returns both owned and shared-with-me rows (the
  // select policy in 0006_policies.sql); user_id is the only thing
  // distinguishing which is which.
  const isShared = !!selected && !!userId && selected.user_id !== userId;

  // One instance per open panel. For an owned category this lists every
  // grant the owner has made (for SharingSection, below); for a shared one
  // it resolves to the viewer's own single grant row, which onDelete needs
  // to leave it. Either way, the "select own or invited category_shares"
  // RLS policy already decided which rows come back.
  const shares = useShares(selectedCat);
  const { reload: reloadShares } = shares;
  useEffect(() => {
    if (expanded && selectedCat) void reloadShares();
  }, [expanded, selectedCat, reloadShares]);

  // Render-time transition rather than an effect, so the rename field is
  // never briefly out of sync with the selection (including a server-side
  // rename normalisation).
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
    if (!selectedCat || !renameIsDirty) return;
    await renameCategory(selectedCat, renameValue);
  }, [selectedCat, renameIsDirty, renameCategory, renameValue]);

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
      // Import creates its category out from under this component, so
      // `cats` hasn't picked it up yet -- reload() must resolve before
      // onSelect, or there is nothing yet to select.
      await runImport(file, (categoryId) => {
        void reload().then(() => onSelect(categoryId));
      });
    },
    [runImport, reload, onSelect],
  );

  // Same button, same position, two different operations: owning this
  // category means the trash destroys it; being a grantee means it only
  // ends *this viewer's* access.
  const { onDelete, onLeave } = useCategoryRemoval({
    selectedCat,
    selected,
    sortedCats,
    categories,
    shares,
    onSelect,
  });

  return (
    <section className="space-y-3">
      {/* One heading in both states, so opening/closing the panel doesn't
          shift the header or anything below it. */}
      <div className="flex items-end justify-between gap-3 border-b border-border pb-3">
        <CategoryText
          title={t('category_select.title')}
          name={selected ? selected.name : t('category_select.none_selected')}
          placeholder={!selected}
          loading={!ready}
        />
        {/* Nothing to collapse to until a category exists, so on first run
            the slot stays empty rather than offering a way back to no
            selection at all. */}
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
            selectedCat={selectedCat}
            onSelect={onSelect}
            sortedCats={sortedCats}
            isLoading={isLoading}
            setExpanded={setExpanded}
            userId={userId}
          />

          {/* Rename and create are separate rows with their own field and
              button, but share one grid so the two fields line up at the
              same width despite the rename row's extra delete button. */}
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
                  value={renameValue}
                  // Shared categories keep this field in the same slot,
                  // disabled rather than hidden or readOnly: RLS's "update
                  // own categories" policy would reject the write anyway,
                  // and readOnly still shows every visual cue of an
                  // editable field except the one that matters (typing).
                  disabled={isShared}
                  title={
                    isShared
                      ? t('category_select.shared_marker_label')
                      : undefined
                  }
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void onRename();
                    if (e.key === 'Escape') {
                      // First Escape discards the edit; only a second one
                      // (nothing left to discard) closes the panel, same
                      // as the new-category field below.
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
                {/* Disabled for the whole export run, not just while the
                    delete request is in flight: a confirmed delete would
                    remove storage objects the export is still reading,
                    failing silently as 404s rather than stopping either
                    action. Also disabled while a shared category's grants
                    haven't loaded, since onLeave needs shares.shares[0] to
                    exist. */}
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

          {/* Only for a category this viewer owns -- a grantee manages
              their own access through Delete (onLeave) and never sees who
              else a category is shared with. */}
          {selected && !isShared && <SharingSection shares={shares} />}

          <ImportRow
            isImporting={isImporting}
            message={importMessage}
            onFile={(file) => void onImportFile(file)}
            onCancel={cancelImport}
          />

          {/* Below its own rule, only once there is a category to take a
              copy of. */}
          {selected && (
            <ExportRow
              isExporting={isExporting}
              isShared={isShared}
              message={exportMessage}
              onExport={() => void runExport(selected)}
              onCancel={cancelExport}
            />
          )}

          {/* Closes the panel off from whatever renders next; only needed
              while expanded, since the collapsed header already has its
              own border-b. */}
          <div aria-hidden="true" className="border-t border-border pt-3" />
        </>
      )}
    </section>
  );
}

'use client';

import { useCallback, useMemo, useRef, useState } from 'react';

import { useConfirm } from '../Confirm/ConfirmProvider';
import { useI18n } from '../../i18n/useI18n';
import { countItemsForCategory } from '../../data/categories';
import type { Category } from '../../types';
import {
  AddButton,
  CancelExportButton,
  CancelImportButton,
  CollapseButton,
  DeleteButtonWithLabel,
  ExpandButton,
  ExportButton,
  ImportButton,
  RenameButton,
} from './Buttons';
import { CategoryText } from './CategoryText';
import { CategorySelectDropdown } from './Dropdown';
import { CategoryInput } from './Input';
import { sortCategories } from './selection';
import type { UseCategories } from './useCategories';
import { useExportCategory } from './useExportCategory';
import { useImportCategory } from './useImportCategory';
import { fieldClasses } from '../ui/fieldClasses';

type Props = {
  selectedCat: string | null;
  onSelect: (id: string | null) => void;
  categories: UseCategories;
};

export default function CategorySelect({
  selectedCat,
  onSelect,
  categories,
}: Props) {
  const { t } = useI18n();
  const confirm = useConfirm();
  const {
    cats,
    isLoading,
    isCreating,
    isDeleting,
    isRenaming,
    reload,
    createCategory,
    renameCategory,
    deleteCategory,
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
  const importInputRef = useRef<HTMLInputElement>(null);
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

  // The initial load, and the auto-select of a lone category, now happen in
  // the page: it needs the answer to decide what goes below this strip, and
  // the collapse that used to ride along with the auto-select is already
  // handled by the selection transition above.

  // The same order the page picks "the first category" from, so the tab it
  // opens on is the tab that reads as first.
  const sortedCats = useMemo(() => sortCategories(cats), [cats]);

  const selected = useMemo<Category | null>(
    () =>
      selectedCat ? (cats.find((c) => c.id === selectedCat) ?? null) : null,
    [cats, selectedCat],
  );

  // Keeps the rename field showing the selected category, including when
  // the selection changes underneath it or a rename normalises server-side.
  // Done as a render-time transition rather than an effect so the field is
  // never briefly out of sync with the selection.
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
      // createCategory reloads before handing back the new row (see
      // useCategories.tsx); import created its category the same way, out
      // from under this component, so `cats` never picked it up and
      // selecting it here found nothing to select (#510).
      await runImport(file, (categoryId) => {
        void reload().then(() => onSelect(categoryId));
      });
    },
    [runImport, reload, onSelect],
  );

  const onDelete = useCallback(async () => {
    if (!selectedCat) return;
    const name = selected?.name ?? '';

    // Named and counted rather than a bare "Confirm deletion": this is the
    // easiest way for someone to destroy their whole collection by
    // accident -- the trash sits right beside the rename field they were
    // probably reaching for -- and it is permanent, with no undo.
    const { count, error: countError } =
      await countItemsForCategory(selectedCat);
    if (countError) console.error(countError);
    const message =
      countError || count == null
        ? t('category_select.confirm_delete_generic').replace('{name}', name)
        : count > 0
          ? t('category_select.confirm_delete_with_entries')
              .replace('{name}', name)
              .replace('{count}', String(count))
          : t('category_select.confirm_delete_empty').replace('{name}', name);

    if (!(await confirm(message))) return;
    const ok = await deleteCategory(selectedCat);
    if (ok) {
      // Falls through to what is left rather than to nothing: a collection
      // with categories in it should always be showing one of them, and
      // deleting a category is no reason to be sent back to a chooser.
      const remaining = sortedCats.filter((c) => c.id !== selectedCat);
      onSelect(remaining[0]?.id ?? null);
    }
  }, [selectedCat, selected, deleteCategory, onSelect, sortedCats, t, confirm]);

  return (
    <section className="space-y-3">
      {/* One heading, in both states. Opening the panel used to replace the
          collection's name with a bare label and swap the pencil for a
          close button drawn at a different height, so every toggle moved
          the heading down, moved the button up, and shifted everything
          below by the difference. The panel now opens *underneath* a
          header that does not move: same line, same slot, same size --
          only the glyph in it changes. */}
      <div className="flex items-end justify-between gap-3 border-b border-border pb-3">
        <CategoryText
          title={t('category_select.title')}
          name={selected ? selected.name : t('category_select.none_selected')}
          placeholder={!selected}
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
          />

          {/* Rename and create are separate rows with their own field and
              their own button. Sharing one input meant the same box
              created a category or did nothing depending on hidden state,
              and there was no way to rename at all.

              They do share one grid, though, so the two fields come out
              the same width: the trailing controls sit in the same two
              columns and the add button spans both. Laid out row by row
              the fields differed by exactly the delete button the rename
              row carries and this one does not. */}
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 gap-y-1.5">
            {selected && (
              <>
                <label
                  htmlFor="rename-category"
                  className="col-span-3 font-label text-[0.6875rem] text-muted-foreground"
                >
                  {t('category_select.rename')}
                </label>
                <input
                  id="rename-category"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void onRename();
                    if (e.key === 'Escape') {
                      // First Escape discards the edit; only a second one
                      // (nothing left to discard) closes the panel -- the
                      // same two-step the new-category field below now
                      // takes, rather than this field swallowing whatever
                      // was typed the moment the key is pressed once.
                      if (renameValue !== selected.name) {
                        setRenameValue(selected.name);
                      } else {
                        setExpanded(false);
                      }
                    }
                  }}
                  className={fieldClasses('min-w-0')}
                />
                <RenameButton
                  onClick={() => void onRename()}
                  disabled={!renameIsDirty || isRenaming || isExporting}
                  label={t('category_select.rename_confirm')}
                />
                {/* Disabled for the whole run, not just while the delete
                    request is in flight: an export reads storage objects a
                    confirmed delete would remove out from under it, and the
                    removals would only fail silently as 404s rather than
                    stopping either action (#419). */}
                <DeleteButtonWithLabel
                  onClick={() => void onDelete()}
                  disabled={isDeleting || isExporting}
                  label={t('category_select.delete')}
                />
              </>
            )}

            <label
              htmlFor="new-category-name"
              className={`col-span-3 font-label text-[0.6875rem] text-muted-foreground ${
                selected ? 'mt-1.5' : ''
              }`}
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

          {/* A category from a file, not a category to select first --
              independent of `selected`, unlike Export below, which needs
              something already there to take a copy of. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-3">
            <input
              ref={importInputRef}
              type="file"
              accept=".zip"
              data-testid="import-file-input"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void onImportFile(file);
              }}
            />
            <ImportButton
              onClick={() => importInputRef.current?.click()}
              disabled={isImporting}
              isImporting={isImporting}
              label={t('category_select.import')}
            />
            {isImporting && (
              <CancelImportButton
                onClick={cancelImport}
                label={t('category_select.import_cancel')}
              />
            )}
            <p
              aria-live="polite"
              className="min-w-0 flex-1 font-label text-[0.6875rem] text-muted-foreground"
            >
              {importMessage ?? t('category_select.import_hint')}
            </p>
          </div>

          {/* Below its own rule, and only once there is a category to take
              a copy of. The line beside the button is where the export
              reports from: it runs for as long as the photographs take,
              which on a large collection is long enough that a button
              which only dimmed would read as broken. */}
          {selected && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-3">
              <ExportButton
                onClick={() => void runExport(selected)}
                disabled={isExporting}
                isExporting={isExporting}
                label={t('category_select.export')}
              />
              {isExporting && (
                <CancelExportButton
                  onClick={cancelExport}
                  label={t('category_select.export_cancel')}
                />
              )}
              <p
                aria-live="polite"
                className="min-w-0 flex-1 font-label text-[0.6875rem] text-muted-foreground"
              >
                {exportMessage ?? t('category_select.export_hint')}
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

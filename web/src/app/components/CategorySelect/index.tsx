'use client';

import { useCallback, useMemo, useState } from 'react';

import { useConfirm } from '../Confirm/ConfirmProvider';
import { useI18n } from '../../i18n/useI18n';
import type { Category } from '../../types';
import {
  AddButton,
  CollapseButton,
  DeleteButtonWithLabel,
  ExpandButton,
} from './Buttons';
import { CategoryText } from './CategoryText';
import { CategorySelectDropdown } from './Dropdown';
import { CategoryInput } from './Input';
import { sortCategories } from './selection';
import type { UseCategories } from './useCategories';

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
    createCategory,
    renameCategory,
    deleteCategory,
  } = categories;
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

  const onDelete = useCallback(async () => {
    if (!selectedCat) return;
    if (!(await confirm(t('category_select.confirmDelete')))) return;
    const ok = await deleteCategory(selectedCat);
    if (ok) {
      // Falls through to what is left rather than to nothing: a collection
      // with categories in it should always be showing one of them, and
      // deleting a category is no reason to be sent back to a chooser.
      const remaining = sortedCats.filter((c) => c.id !== selectedCat);
      onSelect(remaining[0]?.id ?? null);
    }
  }, [selectedCat, deleteCategory, onSelect, sortedCats, t, confirm]);

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
              and there was no way to rename at all. */}
          {selected && (
            <div className="space-y-1.5">
              <label
                htmlFor="rename-category"
                className="font-label text-[0.6875rem] text-muted-foreground block"
              >
                {t('category_select.rename')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="rename-category"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void onRename();
                    if (e.key === 'Escape') setRenameValue(selected.name);
                  }}
                  className="flex-1 min-w-0 rounded-sm px-3 py-2 min-h-11 bg-card text-card-foreground ring-1 ring-inset ring-border focus:ring-foreground"
                />
                <button
                  type="button"
                  onClick={() => void onRename()}
                  disabled={!renameIsDirty || isRenaming}
                  className="min-h-11 px-4 rounded-sm font-label text-xs ring-1 ring-inset ring-border hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                >
                  {t('category_select.rename')}
                </button>
                <DeleteButtonWithLabel
                  onClick={onDelete}
                  disabled={isDeleting}
                  label={t('category_select.delete')}
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="new-category-name"
              className="font-label text-[0.6875rem] text-muted-foreground block"
            >
              {t('category_select.new_category')}
            </label>
            <div className="flex items-center gap-2">
              <CategoryInput
                name={name}
                setName={setName}
                createCategory={onCreate}
                setExpanded={setExpanded}
              />
              <AddButton
                onClick={onCreate}
                disabled={name.trim() === '' || isCreating}
                isCreating={isCreating}
                label={t('category_select.add')}
              />
            </div>
          </div>
        </>
      )}
    </section>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useI18n } from '../../i18n/useI18n';
import type { Category } from '../../types';
import {
  AddButton,
  DeleteButtonWithLabel,
  ExpandButton,
  SetButton,
} from './Buttons';
import { CategoryText } from './CategoryText';
import { CategorySelectDropdown } from './Dropdown';
import { CategoryInput } from './Input';
import { useCategories } from './useCategories.tsx';

type Props = {
  selectedCat: string | null;
  onSelect: (id: string | null) => void;
};

export default function CategorySelect({ selectedCat, onSelect }: Props) {
  const { t } = useI18n();
  const {
    cats,
    isLoading,
    isCreating,
    isDeleting,
    createCategory,
    deleteCategory,
    reload,
  } = useCategories();
  const [name, setName] = useState('');
  const [expanded, setExpanded] = useState(!selectedCat);

  useEffect(() => {
    setExpanded(!selectedCat);
  }, [selectedCat]);

  useEffect(() => {
    reload().then((catsData) => {
      if (catsData.length === 1) {
        onSelect(catsData[0].id);
        setExpanded(false);
      }
    });
  }, [reload, onSelect]);

  const sortedCats = useMemo(
    () =>
      [...cats].sort((a, b) =>
        a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }),
      ),
    [cats],
  );

  const selected = useMemo<Category | null>(
    () =>
      selectedCat ? (cats.find((c) => c.id === selectedCat) ?? null) : null,
    [cats, selectedCat],
  );

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
    if (!confirm(t('category_select.confirmDelete'))) return;
    const ok = await deleteCategory(selectedCat);
    if (ok) {
      onSelect(null);
      setExpanded(true);
    }
  }, [selectedCat, deleteCategory, onSelect, t]);

  if (!expanded && selected) {
    return (
      <section className="rounded-2xl border bg-card/70 dark:bg-card/60 backdrop-blur shadow-sm p-4 flex items-center justify-between">
        <CategoryText title={t('category_select.title')} name={selected.name} />
        <div className="flex items-center gap-2">
          <ExpandButton
            onClick={() => setExpanded(true)}
            label={t('category_select.open_category')}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border bg-card/70 dark:bg-card/60 backdrop-blur shadow-sm p-4 space-y-3">
      <h2 className="text-base font-semibold">{t('category_select.title')}</h2>

      <CategorySelectDropdown
        selectedCat={selectedCat}
        onSelect={onSelect}
        sortedCats={sortedCats}
        isLoading={isLoading}
        t={t}
        setExpanded={setExpanded}
      />

      <div className="space-y-2">
        <CategoryInput
          name={name}
          setName={setName}
          createCategory={onCreate}
          setExpanded={setExpanded}
          t={t}
        />

        <div className="flex items-center gap-2 pt-1">
          {selectedCat && (
            <DeleteButtonWithLabel
              onClick={onDelete}
              disabled={isDeleting}
              label={t('category_select.delete')}
            />
          )}

          {selectedCat && name.trim() === '' && (
            <SetButton
              onClick={() => {
                setExpanded(false);
                onSelect(selectedCat);
              }}
              label={t('category_select.set')}
            />
          )}

          {(!selectedCat || name.trim() !== '') && (
            <AddButton
              onClick={onCreate}
              disabled={name.trim() === '' || isCreating}
              isCreating={isCreating}
              label={t('category_select.add')}
            />
          )}
        </div>
      </div>
    </section>
  );
}

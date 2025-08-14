'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Category } from '../types';
import { useI18n } from '../hooks/useI18n';

interface Props {
  selectedCat: string | null;
  onSelect: (id: string | null) => void;
}

function CategorySelectDropdown({
  selectedCat,
  onSelect,
  sortedCats,
  isLoading,
  t,
  setExpanded,
}: {
  selectedCat: string | null;
  onSelect: (id: string | null) => void;
  sortedCats: { id: string; name: string }[];
  isLoading: boolean;
  t: (key: string) => string;
  setExpanded: (val: boolean) => void;
}) {
  return (
    <div className="relative">
      <select
        value={selectedCat ?? ''}
        onChange={(e) => {
          const v = e.target.value || null;
          onSelect(v);
          if (v) setExpanded(false);
        }}
        disabled={isLoading}
        className="w-full appearance-none rounded-xl border px-3 py-2 pr-10 bg-white/60 dark:bg-neutral-800/70 outline-none focus:border-neutral-400 dark:focus:border-neutral-600 transition"
        aria-label={t('category_select.select_placeholder')}
      >
        <option value="">{t('category_select.select_placeholder')}</option>
        {sortedCats.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm opacity-70">
        ▾
      </span>
    </div>
  );
}

function CategoryInput({
  name,
  setName,
  createCategory,
  setExpanded,
  t,
}: {
  name: string;
  setName: (val: string) => void;
  createCategory: () => void;
  setExpanded: (val: boolean) => void;
  t: (key: string) => string;
}) {
  return (
    <input
      value={name}
      onChange={(e) => setName(e.target.value)}
      placeholder={t('category_select.new_category')}
      onKeyDown={(e) => {
        if (e.key === 'Enter') createCategory();
        if (e.key === 'Escape') setExpanded(false);
      }}
      className="w-full rounded-xl border px-3 py-2 bg-white/60 dark:bg-neutral-800/70 outline-none focus:border-neutral-400 dark:focus:border-neutral-600"
    />
  );
}

function AddButton({
  onClick,
  disabled,
  isCreating,
  label,
}: {
  onClick: () => void;
  disabled: boolean;
  isCreating: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl w-10 h-10 sm:w-auto sm:px-4 sm:py-2 flex items-center justify-center bg-black text-white hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
    >
      {isCreating ? (
        '…'
      ) : (
        <>
          <svg
            viewBox="0 0 24 24"
            className="w-5 h-5 sm:hidden"
            aria-hidden="true"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span className="hidden sm:inline">{label}</span>
        </>
      )}
    </button>
  );
}

function SetButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl w-10 h-10 sm:w-auto sm:px-4 sm:py-2 flex items-center justify-center border bg-white/60 dark:bg-neutral-800/70 hover:bg-neutral-100 dark:hover:bg-neutral-700"
    >
      <svg
        viewBox="0 0 24 24"
        className="w-5 h-5 sm:hidden"
        aria-hidden="true"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 6L9 17l-5-5" />
      </svg>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function CategoryText({ title, name }: { title: string; name: string }) {
  return (
    <div className="truncate">
      <h2 className="text-base font-semibold mb-1">{title}</h2>
      <div className="font-medium truncate">{name}</div>
    </div>
  );
}

function DeleteButton({
  onClick,
  disabled,
  label,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-full w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center border text-red-600 border-red-500/40 bg-white/60 dark:bg-neutral-800/70 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-60"
      aria-label={label}
      title={label}
    >
      <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
        <path
          d="M3 6h18"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
        />
        <path
          d="M10 11v6M14 11v6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

function ExpandButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-full w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center border bg-white/60 dark:bg-neutral-800/70 hover:bg-neutral-100 dark:hover:bg-neutral-700"
      aria-label={label}
      title={label}
    >
      <svg
        viewBox="0 0 24 24"
        className="w-5 h-5"
        aria-hidden="true"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
      </svg>
    </button>
  );
}

export default function CategorySelect({ selectedCat, onSelect }: Props) {
  const { t } = useI18n();
  const [cats, setCats] = useState<Category[]>([]);
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [expanded, setExpanded] = useState(!selectedCat);

  useEffect(() => {
    setExpanded(!selectedCat);
  }, [selectedCat]);

  const sortedCats = useMemo(
    () =>
      [...cats].sort((a, b) =>
        a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }),
      ),
    [cats],
  );

  const selected = useMemo(
    () =>
      selectedCat ? (cats.find((c) => c.id === selectedCat) ?? null) : null,
    [cats, selectedCat],
  );

  const loadCats = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('id,name');
      if (error) throw error;
      setCats((data as Category[]) ?? []);
    } catch (e) {
      console.error(e);
      alert(t('category_select.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadCats();
  }, [loadCats]);

  const createCategory = async () => {
    const trimmed = name.trim();
    if (!trimmed || isCreating) return;
    setIsCreating(true);
    try {
      const { data, error } = await supabase
        .from('categories')
        .insert({ name: trimmed })
        .select('id,name')
        .single();
      if (error) throw error;
      setName('');
      await loadCats();
      if (data?.id) {
        onSelect(data.id);
        setExpanded(false);
      }
    } catch (e) {
      console.error(e);
      alert(t('category_select.createError'));
    } finally {
      setIsCreating(false);
    }
  };

  const deleteSelected = async () => {
    if (!selectedCat || isDeleting) return;
    if (!confirm(t('category_select.confirmDelete'))) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', selectedCat);
      if (error) throw error;
      onSelect(null);
      await loadCats();
      setExpanded(true);
    } catch (e) {
      console.error(e);
      alert(t('category_select.deleteError'));
    } finally {
      setIsDeleting(false);
    }
  };

  if (!expanded && selected) {
    return (
      <section className="rounded-2xl border bg-white/70 dark:bg-neutral-900/60 backdrop-blur shadow-sm p-4 flex items-center justify-between">
        <CategoryText title={t('category_select.title')} name={selected.name} />
        <div className="flex items-center gap-2">
          <DeleteButton
            onClick={deleteSelected}
            disabled={isDeleting}
            label={t('category_select.delete')}
          />
          <ExpandButton
            onClick={() => setExpanded(true)}
            label={t('category_select.open_category')}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border bg-white/70 dark:bg-neutral-900/60 backdrop-blur shadow-sm p-4 space-y-3">
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
          createCategory={createCategory}
          setExpanded={setExpanded}
          t={t}
        />

        <div className="flex items-center gap-2 pt-1">
          {name.trim() === '' ? (
            <SetButton
              onClick={() => {
                setExpanded(false);
                if (selectedCat) onSelect(selectedCat);
              }}
              label={t('category_select.set')}
            />
          ) : (
            <AddButton
              onClick={createCategory}
              disabled={isCreating}
              isCreating={isCreating}
              label={t('category_select.add')}
            />
          )}
        </div>
      </div>
    </section>
  );
}

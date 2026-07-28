'use client';
import type { CSSProperties } from 'react';
import { useI18n } from '../../i18n/useI18n';
import { inkVarFor } from '../../lib/specimen';

type Props = {
  selectedCat: string | null;
  onSelect: (id: string | null) => void;
  sortedCats: { id: string; name: string }[];
  isLoading: boolean;
  setExpanded: (v: boolean) => void;
};

// A row of labeled drawer pulls rather than a native <select> -- every
// category is visible at once, tinted by its own assigned ink, and the
// selected one reads as "pulled open" toward the content below it.
export function CategorySelectDropdown({
  selectedCat,
  onSelect,
  sortedCats,
  isLoading,
  setExpanded,
}: Props) {
  const { t } = useI18n();

  if (isLoading) {
    return (
      <div className="font-label text-xs text-foreground/70" aria-live="polite">
        {t('common.loading')}
      </div>
    );
  }

  if (!sortedCats.length) return null;

  return (
    <div
      role="tablist"
      aria-label={t('category_select.select_placeholder')}
      className="flex flex-wrap gap-2"
    >
      {sortedCats.map((c) => {
        const active = c.id === selectedCat;
        const ink = inkVarFor(c.name);
        return (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => {
              onSelect(c.id);
              setExpanded(false);
            }}
            style={{ '--ink': ink } as CSSProperties}
            className={[
              'font-label text-xs rounded-t-lg rounded-b-sm px-3 py-2 border-2 transition-transform',
              active
                ? 'bg-[var(--ink)] text-card border-[var(--ink)] translate-y-0.5 shadow-inner'
                : 'bg-card text-card-foreground border-[var(--ink)] hover:-translate-y-0.5 hover:shadow-sm',
            ].join(' ')}
          >
            {c.name}
          </button>
        );
      })}
    </div>
  );
}

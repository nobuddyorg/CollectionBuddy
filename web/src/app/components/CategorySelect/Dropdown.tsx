'use client';
import { useI18n } from '../../i18n/useI18n';

type Props = {
  selectedCat: string | null;
  onSelect: (id: string | null) => void;
  sortedCats: { id: string; name: string }[];
  isLoading: boolean;
  setExpanded: (v: boolean) => void;
};

// Card-catalogue dividers: the active category is marked by an ink rule
// under its name, the way a tabbed divider stands proud of the cards behind
// it. No fills, no per-category colour -- colour belongs to the photographs.
//
// Scrolls horizontally on narrow screens rather than wrapping to three rows.
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
      className="-mx-4 px-4 flex gap-5 overflow-x-auto border-b border-border sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {sortedCats.map((c) => {
        const active = c.id === selectedCat;
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
            className={[
              'font-label text-xs shrink-0 min-h-11 -mb-px border-b-2 transition-colors',
              active
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {c.name}
          </button>
        );
      })}
    </div>
  );
}

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

  // Placeholder dividers rather than a "Loading…" line: the strip keeps
  // its height and its rule, so the page below it doesn't step down when
  // the real tabs arrive. Three of them, at uneven widths, because
  // category names are uneven -- three matched bars read as a component
  // rather than as something unfinished.
  if (isLoading) {
    return (
      <div
        role="status"
        aria-label={t('common.loading')}
        className="flex min-h-11 items-center gap-5 border-b border-border"
      >
        {['4.5rem', '3rem', '5.5rem'].map((w) => (
          <div
            key={w}
            className="h-3 rounded-sm bg-muted"
            style={{ width: w }}
          />
        ))}
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

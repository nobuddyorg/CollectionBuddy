'use client';
import { useCallback, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { useI18n } from '../../i18n/useI18n';

type Props = {
  selectedCat: string | null;
  onSelect: (id: string | null) => void;
  sortedCats: { id: string; name: string }[];
  isLoading: boolean;
  setExpanded: (v: boolean) => void;
};

// Shared with page.tsx, which owns the entries section this tablist
// controls -- one fixed id because there is only ever one panel on screen,
// its contents swapping with the selection rather than the id.
export const CATEGORY_TABPANEL_ID = 'category-entries-panel';

export const categoryTabId = (id: string) => `category-tab-${id}`;

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
    <CategoryTablist
      selectedCat={selectedCat}
      onSelect={onSelect}
      sortedCats={sortedCats}
      setExpanded={setExpanded}
      ariaLabel={t('category_select.select_placeholder')}
    />
  );
}

type TablistProps = {
  selectedCat: string | null;
  onSelect: (id: string | null) => void;
  sortedCats: { id: string; name: string }[];
  setExpanded: (v: boolean) => void;
  ariaLabel: string;
};

// Roving tabindex: only the selected tab is a Tab stop, and ArrowLeft/
// ArrowRight/Home/End move both focus and selection between the others --
// the keyboard model a "tab, 1 of 3" announcement promises. Wraps from the
// last tab to the first (and back) rather than stopping, since the count of
// categories is arbitrary and a hard edge would just be a dead end to arrow
// into.
function CategoryTablist({
  selectedCat,
  onSelect,
  sortedCats,
  setExpanded,
  ariaLabel,
}: TablistProps) {
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  const activeIndex = sortedCats.findIndex((c) => c.id === selectedCat);
  const rovingIndex = activeIndex === -1 ? 0 : activeIndex;

  const moveTo = useCallback(
    (index: number) => {
      const target = sortedCats[index];
      if (!target) return;
      onSelect(target.id);
      tabRefs.current.get(target.id)?.focus();
    },
    [sortedCats, onSelect],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          moveTo((index + 1) % sortedCats.length);
          return;
        case 'ArrowLeft':
          e.preventDefault();
          moveTo((index - 1 + sortedCats.length) % sortedCats.length);
          return;
        case 'Home':
          e.preventDefault();
          moveTo(0);
          return;
        case 'End':
          e.preventDefault();
          moveTo(sortedCats.length - 1);
          return;
      }
    },
    [sortedCats.length, moveTo],
  );

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="-mx-4 px-4 flex gap-5 overflow-x-auto border-b border-border sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {sortedCats.map((c, index) => {
        const active = c.id === selectedCat;
        return (
          <button
            key={c.id}
            ref={(el) => {
              if (el) tabRefs.current.set(c.id, el);
              else tabRefs.current.delete(c.id);
            }}
            type="button"
            role="tab"
            id={categoryTabId(c.id)}
            aria-selected={active}
            aria-controls={CATEGORY_TABPANEL_ID}
            tabIndex={index === rovingIndex ? 0 : -1}
            onClick={() => {
              onSelect(c.id);
              setExpanded(false);
            }}
            onKeyDown={(e) => onKeyDown(e, index)}
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

'use client';
import { useCallback, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { useI18n } from '../../i18n/useI18n';
import Icon, { IconType } from '../Icon';

type CategoryTab = { id: string; name: string; user_id: string };

type Props = {
  selectedCat: string | null;
  onSelect: (id: string | null) => void;
  sortedCats: CategoryTab[];
  isLoading: boolean;
  setExpanded: (v: boolean) => void;
  userId: string | null;
};

// Shared with page.tsx, which owns the panel this tablist controls -- one
// fixed id since there is only ever one panel on screen.
export const CATEGORY_TABPANEL_ID = 'category-entries-panel';

export const categoryTabId = (id: string) => `category-tab-${id}`;

// No per-category colour or fill -- colour is reserved for the photographs.
export function CategorySelectDropdown({
  selectedCat,
  onSelect,
  sortedCats,
  isLoading,
  setExpanded,
  userId,
}: Props) {
  const { t } = useI18n();

  // Placeholder dividers, not a "Loading…" line: keeps the strip's height so
  // nothing shifts when the real tabs arrive. Uneven widths since real
  // category names are uneven too.
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
      userId={userId}
    />
  );
}

type TablistProps = {
  selectedCat: string | null;
  onSelect: (id: string | null) => void;
  sortedCats: CategoryTab[];
  setExpanded: (v: boolean) => void;
  ariaLabel: string;
  userId: string | null;
};

// Roving tabindex: only the selected tab is a Tab stop; arrow keys/Home/End
// move both focus and selection. Wraps at the ends rather than stopping,
// since the tab count is arbitrary.
function CategoryTablist({
  selectedCat,
  onSelect,
  sortedCats,
  setExpanded,
  ariaLabel,
  userId,
}: TablistProps) {
  const { t } = useI18n();
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
            <span className="inline-flex items-center gap-1">
              {c.user_id !== userId && (
                <span
                  className="inline-flex shrink-0"
                  title={t('category_select.shared_marker_label')}
                >
                  <Icon
                    icon={IconType.Share}
                    role="img"
                    aria-label={t('category_select.shared_marker_label')}
                    className="w-3 h-3"
                  />
                </span>
              )}
              {c.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

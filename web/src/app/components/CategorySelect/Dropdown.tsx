'use client';
import { useCallback, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { useI18n } from '../../i18n/useI18n';
import Icon, { IconType } from '../Icon';

type CategoryTab = { id: string; name: string; user_id: string };

type Props = {
  selectedCategoryId: string | null;
  onSelect: (id: string | null) => void;
  sortedCategories: CategoryTab[];
  isLoading: boolean;
  setExpanded: (value: boolean) => void;
  userId: string | null;
};

// Shared with page.tsx, which owns the one panel this tablist controls.
export const CATEGORY_TABPANEL_ID = 'category-entries-panel';

export const categoryTabId = (id: string) => `category-tab-${id}`;

// No per-category colour or fill -- colour is reserved for the photographs.
export function CategorySelectDropdown({
  selectedCategoryId,
  onSelect,
  sortedCategories,
  isLoading,
  setExpanded,
  userId,
}: Props) {
  const { t } = useI18n();

  // Placeholder bars of uneven width keep the strip's height until the real tabs arrive.
  if (isLoading) {
    return (
      <div
        role="status"
        aria-label={t('common.loading')}
        className="flex min-h-11 items-center gap-5 border-b border-border"
      >
        {['4.5rem', '3rem', '5.5rem'].map((width) => (
          <div
            key={width}
            className="h-3 rounded-sm bg-muted"
            style={{ width }}
          />
        ))}
      </div>
    );
  }

  if (!sortedCategories.length) return null;

  return (
    <CategoryTablist
      selectedCategoryId={selectedCategoryId}
      onSelect={onSelect}
      sortedCategories={sortedCategories}
      setExpanded={setExpanded}
      ariaLabel={t('category_select.select_placeholder')}
      userId={userId}
    />
  );
}

type TablistProps = {
  selectedCategoryId: string | null;
  onSelect: (id: string | null) => void;
  sortedCategories: CategoryTab[];
  setExpanded: (value: boolean) => void;
  ariaLabel: string;
  userId: string | null;
};

// Roving tabindex: one Tab stop; arrows/Home/End move focus and selection, wrapping at the ends.
function CategoryTablist({
  selectedCategoryId,
  onSelect,
  sortedCategories,
  setExpanded,
  ariaLabel,
  userId,
}: TablistProps) {
  const { t } = useI18n();
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  const activeIndex = sortedCategories.findIndex(
    (category) => category.id === selectedCategoryId,
  );
  const rovingIndex = activeIndex === -1 ? 0 : activeIndex;

  const moveTo = useCallback(
    (index: number) => {
      const target = sortedCategories[index];
      onSelect(target.id);
      tabRefs.current.get(target.id)?.focus();
    },
    [sortedCategories, onSelect],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
      switch (event.key) {
        case 'ArrowRight':
          event.preventDefault();
          moveTo((index + 1) % sortedCategories.length);
          return;
        case 'ArrowLeft':
          event.preventDefault();
          moveTo(
            (index - 1 + sortedCategories.length) % sortedCategories.length,
          );
          return;
        case 'Home':
          event.preventDefault();
          moveTo(0);
          return;
        case 'End':
          event.preventDefault();
          moveTo(sortedCategories.length - 1);
          return;
      }
    },
    [sortedCategories.length, moveTo],
  );

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="-mx-4 px-4 flex gap-5 overflow-x-auto border-b border-border sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {sortedCategories.map((category, index) => {
        const active = category.id === selectedCategoryId;
        return (
          <button
            key={category.id}
            ref={(element) => {
              if (element) tabRefs.current.set(category.id, element);
              else tabRefs.current.delete(category.id);
            }}
            type="button"
            role="tab"
            data-testid="category-tab"
            id={categoryTabId(category.id)}
            aria-selected={active}
            aria-controls={CATEGORY_TABPANEL_ID}
            tabIndex={index === rovingIndex ? 0 : -1}
            onClick={() => {
              onSelect(category.id);
              setExpanded(false);
            }}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={[
              'font-label text-xs shrink-0 min-h-11 -mb-px border-b-2 transition-colors',
              active
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            <span className="inline-flex items-center gap-1">
              {category.user_id !== userId && (
                <span
                  className="inline-flex shrink-0"
                  data-testid="shared-marker"
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
              <span data-testid="category-tab-name">{category.name}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

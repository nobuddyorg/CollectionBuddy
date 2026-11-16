'use client';

import { useI18n } from '../../i18n/useI18n';
import EmptyState from '../EmptyState';

/** "No entries", "No results" or "No entries at" a place, each with the way back that fits it. */
export function EntriesEmptyState({
  query,
  searchActive,
  place,
  canEdit,
  onClearSearch,
}: {
  /** The debounced search, '' for none. */
  query: string;
  /** Whether the search was long enough to filter at all. */
  searchActive: boolean;
  /** The place the list is narrowed to, '' for every place. */
  place: string;
  canEdit: boolean;
  onClearSearch: () => void;
}) {
  const { t } = useI18n();
  let title = t('item_list.no_items_title');
  // A viewer's New entry button is disabled, so their hint must not point at it.
  let hint = canEdit
    ? t('item_list.no_items_hint')
    : t('item_list.no_items_hint_read_only');
  if (searchActive) {
    title = t('item_list.no_results_title', { query });
    hint = t('item_list.no_results_hint');
  } else if (place) {
    title = t('item_list.place_empty_title', { place });
    hint = t('item_list.place_empty_hint');
  }
  return (
    <EmptyState
      symbol={query ? '🔍' : '🧺'}
      title={title}
      hint={hint}
      titleTestId="empty-title"
    >
      {query && (
        <button
          type="button"
          data-testid="empty-clear-search"
          onClick={onClearSearch}
          className="min-h-11 px-3 font-label text-xs text-foreground underline underline-offset-4"
        >
          {t('item_list.search_clear')}
        </button>
      )}
    </EmptyState>
  );
}

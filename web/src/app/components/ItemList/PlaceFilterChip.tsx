'use client';

import { useI18n } from '../../i18n/useI18n';
import Icon, { IconType } from '../Icon';

/** Says the list is narrowed to one place, so a short list never looks broken; × shows every place again. */
export function PlaceFilterChip({
  place,
  onClear,
}: {
  place: string;
  onClear: () => void;
}) {
  const { t } = useI18n();
  return (
    <div
      role="group"
      data-testid="place-filter"
      aria-label={t('item_list.place_filter_label')}
      className="inline-flex max-w-full items-center gap-1 rounded-sm bg-muted pl-3 font-label text-xs"
    >
      <Icon icon={IconType.Gps} className="h-4 w-4 shrink-0" aria-hidden />
      <span data-testid="place-filter-name" className="truncate">
        {place}
      </span>
      <button
        type="button"
        data-testid="place-filter-clear"
        onClick={onClear}
        title={t('item_list.place_filter_clear')}
        aria-label={t('item_list.place_filter_clear')}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm hover:bg-background/60"
      >
        <Icon icon={IconType.Close} className="h-4 w-4" />
      </button>
    </div>
  );
}

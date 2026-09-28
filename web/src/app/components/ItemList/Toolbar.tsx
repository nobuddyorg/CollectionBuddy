'use client';
import { useI18n } from '../../i18n/useI18n';
import { prefetchOnIntent } from '../../lib/prefetchOnIntent';
import Icon, { IconType } from '../Icon';
import { prefetchItemForm } from '../ItemForm/load';
import { filledButtonClasses } from '../ui/buttonClasses';
import { prefetchMap } from './MapModal';
import { SearchInput } from './SearchInput';

export function Toolbar({
  query,
  onQueryChange,
  canEdit,
  onNewEntry,
  onOpenMap,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  canEdit: boolean;
  onNewEntry: () => void;
  onOpenMap: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex-1">
        <SearchInput value={query} onChange={onQueryChange} />
      </div>

      <div className="flex gap-2 sm:shrink-0">
        <button
          type="button"
          data-testid="new-entry"
          onClick={onNewEntry}
          {...(canEdit ? prefetchOnIntent(prefetchItemForm) : {})}
          disabled={!canEdit}
          title={
            canEdit ? undefined : t('item_create.new_entry_disabled_shared')
          }
          className={filledButtonClasses(
            'primary',
            'flex-1 sm:flex-none flex items-center justify-center gap-2 disabled:opacity-40 disabled:hover:opacity-40 disabled:cursor-not-allowed transition-opacity',
          )}
        >
          <Icon icon={IconType.Plus} className="w-4 h-4" aria-hidden="true" />
          {t('item_create.new_entry')}
        </button>

        <button
          type="button"
          data-testid="open-map"
          onClick={onOpenMap}
          {...prefetchOnIntent(prefetchMap)}
          className="min-h-11 w-11 shrink-0 flex items-center justify-center rounded-sm ring-1 ring-inset ring-control-border text-foreground hover:bg-muted transition-colors"
          aria-label={t('item_list.open_map')}
          title={t('item_list.open_map')}
        >
          <Icon icon={IconType.Map} className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

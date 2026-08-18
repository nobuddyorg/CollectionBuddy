'use client';

import { useI18n } from '../../i18n/useI18n';
import Icon, { IconType } from '../Icon';

export function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="relative flex w-full items-center">
      <Icon
        icon={IconType.Search}
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        type="search"
        enterKeyHint="search"
        data-testid="search-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={t('item_list.search_placeholder')}
        placeholder={t('item_list.search_placeholder')}
        className="w-full min-h-11 rounded-sm bg-card text-card-foreground py-2 pl-9 pr-10 ring-1 ring-inset ring-control-border focus:ring-foreground placeholder:text-muted-foreground"
      />
      {/* The only clear button: the browser's own is suppressed in
          globals.css. */}
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          // -mr-2 only: -mt-2 would double the vertical shift that
          // -translate-y-1/2 already applies, pushing the icon high.
          className="absolute right-3 top-1/2 -translate-y-1/2 p-2 -mr-2 inline-flex items-center justify-center"
          aria-label={t('item_list.search_clear')}
        >
          <Icon
            icon={IconType.Close}
            className="h-5 w-5 text-muted-foreground hover:text-foreground"
          />
        </button>
      )}
    </div>
  );
}

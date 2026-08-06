'use client';

import { useI18n } from '../../i18n/useI18n';
import { Icon, IconType } from '../Icon';

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
        // Named for the end-to-end suite. Its only other handle is the
        // placeholder, which is translated -- so a test would either pin the
        // language or break when the wording changes.
        data-testid="search-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={t('item_list.search_placeholder')}
        placeholder={t('item_list.search_placeholder')}
        className="w-full min-h-11 rounded-sm bg-card text-card-foreground py-2 pl-9 pr-10 ring-1 ring-inset ring-border focus:ring-foreground placeholder:text-muted-foreground"
      />
      {/* The only clear button: the browser's own is suppressed in
          globals.css. This one is labelled, keyboard-reachable and drawn
          to the app's ink, which the native glyph is none of. */}
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2"
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

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
        className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
        aria-hidden
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('item_list.search_placeholder')}
        className="w-full rounded-xl border bg-background py-2 pl-9 pr-10 shadow-sm"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="clear-button absolute right-3 top-1/2 -translate-y-1/2"
          aria-label={t('item_list.search_clear')}
        >
          <Icon
            icon={IconType.Close}
            className="h-5 w-5 text-gray-400 hover:text-gray-600"
          />
        </button>
      )}
    </div>
  );
}

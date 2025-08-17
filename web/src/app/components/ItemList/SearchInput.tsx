'use client';

import { useI18n } from '../../i18n/useI18n';

export function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useI18n();
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={t('item_list.search_placeholder')}
      className="w-full rounded-xl border bg-background px-3 py-2 shadow-sm"
    />
  );
}

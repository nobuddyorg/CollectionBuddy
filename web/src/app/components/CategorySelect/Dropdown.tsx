'use client';
import { useI18n } from '../../i18n/useI18n';

type Props = {
  selectedCat: string | null;
  onSelect: (id: string | null) => void;
  sortedCats: { id: string; name: string }[];
  isLoading: boolean;
  setExpanded: (v: boolean) => void;
};
export function CategorySelectDropdown({
  selectedCat,
  onSelect,
  sortedCats,
  isLoading,
  setExpanded,
}: Props) {
  const { t } = useI18n();
  return (
    <div className="relative">
      <select
        value={selectedCat ?? ''}
        onChange={(e) => {
          const v = e.target.value || null;
          onSelect(v);
          if (v) setExpanded(false);
        }}
        disabled={isLoading}
        className="w-full appearance-none rounded-xl border px-3 py-2 pr-10 bg-card/60 dark:bg-card/70 focus:border-primary dark:focus:border-primary transition"
        aria-label={t('category_select.select_placeholder')}
      >
        <option value="">{t('category_select.select_placeholder')}</option>
        {sortedCats.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm opacity-70"
      >
        ▾
      </span>
    </div>
  );
}

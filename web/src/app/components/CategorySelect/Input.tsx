'use client';
import { useI18n } from '../../i18n/useI18n';

type Props = {
  name: string;
  setName: (v: string) => void;
  createCategory: () => void;
  setExpanded: (v: boolean) => void;
};
export function CategoryInput({
  name,
  setName,
  createCategory,
  setExpanded,
}: Props) {
  const { t } = useI18n();
  return (
    <input
      id="new-category-name"
      value={name}
      onChange={(e) => setName(e.target.value)}
      placeholder={t('category_select.new_category')}
      onKeyDown={(e) => {
        if (e.key === 'Enter') createCategory();
        if (e.key === 'Escape') setExpanded(false);
      }}
      // Sized by its grid column, which it shares with the rename field
      // above so the two come out the same width.
      className="w-full min-w-0 rounded-sm px-3 py-2 min-h-11 bg-card text-card-foreground ring-1 ring-inset ring-control-border focus:ring-foreground"
    />
  );
}

'use client';
import { useI18n } from '../../i18n/useI18n';
import { fieldClasses } from '../ui/fieldClasses';

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
        if (e.key === 'Escape') {
          // Matches the rename field: the first Escape only clears what was
          // typed. Collapsing the whole panel on one press discarded a
          // half-typed name the same key would, on the field right above
          // it, merely have cleared.
          if (name !== '') {
            setName('');
          } else {
            setExpanded(false);
          }
        }
      }}
      // Sized by its grid column, which it shares with the rename field
      // above so the two come out the same width.
      className={fieldClasses('min-w-0')}
    />
  );
}

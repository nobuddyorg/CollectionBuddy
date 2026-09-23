'use client';
import { useI18n } from '../../i18n/useI18n';
import { fieldClasses } from '../ui/fieldClasses';
import { MAX_CATEGORY_NAME_LENGTH } from '../../lib/textLimits';

type Props = {
  name: string;
  setName: (value: string) => void;
  createCategory: () => void;
  setExpanded: (value: boolean) => void;
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
      data-testid="new-category-input"
      value={name}
      maxLength={MAX_CATEGORY_NAME_LENGTH}
      onChange={(event) => setName(event.target.value)}
      placeholder={t('category_select.new_category')}
      onKeyDown={(event) => {
        if (event.key === 'Enter') createCategory();
        if (event.key === 'Escape') {
          // First Escape clears the name; a second one (nothing left to clear) collapses the panel.
          if (name !== '') {
            setName('');
          } else {
            setExpanded(false);
          }
        }
      }}
      className={fieldClasses('min-w-0')}
    />
  );
}

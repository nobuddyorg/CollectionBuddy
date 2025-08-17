'use client';
type Props = {
  name: string;
  setName: (v: string) => void;
  createCategory: () => void;
  setExpanded: (v: boolean) => void;
  t: (key: string) => string;
};
export function CategoryInput({
  name,
  setName,
  createCategory,
  setExpanded,
  t,
}: Props) {
  return (
    <input
      value={name}
      onChange={(e) => setName(e.target.value)}
      placeholder={t('category_select.new_category')}
      onKeyDown={(e) => {
        if (e.key === 'Enter') createCategory();
        if (e.key === 'Escape') setExpanded(false);
      }}
      className="w-full rounded-xl border px-3 py-2 bg-card/60 dark:bg-card/70 outline-none focus:border-primary dark:focus:border-primary"
    />
  );
}

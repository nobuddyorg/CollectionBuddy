'use client';

import { useI18n } from '../../i18n/useI18n';
import type { MenuProps } from './types';

function SegmentedControl<T extends string>({
  value,
  options,
  labels,
  onChange,
}: {
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-lg border overflow-hidden">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={`px-2 py-1 text-xs ${
            value === option
              ? 'bg-primary text-primary-foreground'
              : 'hover:bg-muted'
          }`}
        >
          {labels[option]}
        </button>
      ))}
    </div>
  );
}

export default function Menu({
  user,
  open,
  onSignOut,
  onClose,
  labelSignOut,
}: MenuProps) {
  const { t, lang, setLang } = useI18n();
  if (!open) return null;
  const menuId = 'user-menu';

  return (
    <div
      id={menuId}
      role="menu"
      aria-labelledby="user-menu-button"
      className="absolute right-0 mt-2 w-56 rounded-xl border bg-card text-card-foreground backdrop-blur p-1 shadow-lg"
    >
      <div className="px-3 py-2 font-label text-[0.65rem] opacity-70 truncate">
        {user.email}
      </div>

      <div className="px-3 py-2 flex items-center justify-between gap-2">
        <span className="text-sm">{t('header.language')}</span>
        <SegmentedControl
          value={lang}
          options={['de', 'en']}
          labels={{ de: 'Deutsch', en: 'English' }}
          onChange={setLang}
        />
      </div>

      <div className="my-1 border-t" />

      <button
        type="button"
        role="menuitem"
        onClick={async () => {
          await onSignOut();
          onClose();
        }}
        className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted text-sm"
      >
        {labelSignOut}
      </button>
    </div>
  );
}

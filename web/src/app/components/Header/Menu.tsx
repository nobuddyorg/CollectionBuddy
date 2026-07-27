'use client';

import { useI18n } from '../../i18n/useI18n';
import { useTheme, type ThemePreference } from '../../useTheme';
import type { MenuProps } from './types';

const THEME_OPTIONS: ThemePreference[] = ['system', 'light', 'dark'];

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
    <div className="flex rounded-lg border border-black/10 dark:border-white/10 overflow-hidden">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={`px-2 py-1 text-xs ${
            value === option
              ? 'bg-primary text-primary-foreground'
              : 'hover:bg-stone-100 dark:hover:bg-neutral-800'
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
  const { preference, setThemePreference } = useTheme();
  if (!open) return null;
  const menuId = 'user-menu';

  return (
    <div
      id={menuId}
      role="menu"
      aria-labelledby="user-menu-button"
      className="absolute right-0 mt-2 w-56 rounded-xl
                 border border-black/10 dark:border-white/10
                 bg-white/90 dark:bg-neutral-900/90
                 backdrop-blur p-1 shadow-lg"
    >
      <div className="px-3 py-2 text-xs opacity-70 truncate">{user.email}</div>

      <div className="px-3 py-2 flex items-center justify-between gap-2">
        <span className="text-sm">{t('header.language')}</span>
        <SegmentedControl
          value={lang}
          options={['de', 'en']}
          labels={{ de: 'Deutsch', en: 'English' }}
          onChange={setLang}
        />
      </div>

      <div className="px-3 py-2 flex items-center justify-between gap-2">
        <span className="text-sm">{t('header.theme')}</span>
        <SegmentedControl
          value={preference}
          options={THEME_OPTIONS}
          labels={{
            system: t('header.theme_system'),
            light: t('header.theme_light'),
            dark: t('header.theme_dark'),
          }}
          onChange={setThemePreference}
        />
      </div>

      <div className="my-1 border-t border-black/10 dark:border-white/10" />

      <button
        type="button"
        role="menuitem"
        onClick={async () => {
          await onSignOut();
          onClose();
        }}
        className="w-full text-left px-3 py-2 rounded-lg hover:bg-stone-100 dark:hover:bg-neutral-800 text-sm"
      >
        {labelSignOut}
      </button>
    </div>
  );
}

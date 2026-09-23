'use client';

import { useI18n } from '../../i18n/useI18n';
import { THEME_PREFERENCES, useTheme } from '../../useTheme';
import type { MenuProps } from './types';
import { labelClasses } from '../ui/labelClasses';

function SegmentedControl<T extends string>({
  value,
  options,
  labels,
  onChange,
  testIdPrefix,
}: {
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (value: T) => void;
  testIdPrefix: string;
}) {
  return (
    // Equal segments: language names are never translated, so their width cannot be budgeted.
    <div className="flex w-full rounded-lg border overflow-hidden">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          data-testid={`${testIdPrefix}-${option}`}
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={`flex-1 px-2.5 min-h-9 text-xs transition-colors ${
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
  const { t, language, setLanguage } = useI18n();
  const { preference, setThemePreference } = useTheme();
  if (!open) return null;
  const menuId = 'user-menu';

  return (
    <div
      id={menuId}
      aria-labelledby="user-menu-button"
      className="absolute right-0 mt-2 w-56 rounded-sm border bg-card text-card-foreground backdrop-blur p-1 shadow-lg"
    >
      <div className={labelClasses('px-3 py-2 truncate')}>{user.email}</div>

      {/* Caption above, not beside: the layout must not depend on a translation's length. */}
      <div className="px-3 py-2 space-y-1.5">
        <span className="block text-sm">{t('header.language')}</span>
        <SegmentedControl
          value={language}
          options={['de', 'en']}
          labels={{ de: 'Deutsch', en: 'English' }}
          onChange={setLanguage}
          testIdPrefix="lang"
        />
      </div>

      <div className="px-3 py-2 space-y-1.5">
        <span className="block text-sm">{t('header.theme')}</span>
        <SegmentedControl
          value={preference}
          options={THEME_PREFERENCES}
          labels={{
            system: t('header.theme_system'),
            light: t('header.theme_light'),
            dark: t('header.theme_dark'),
          }}
          onChange={setThemePreference}
          testIdPrefix="theme"
        />
      </div>

      <div className="my-1 border-t" />

      <button
        type="button"
        data-testid="sign-out"
        onClick={() => {
          void (async () => {
            await onSignOut();
            onClose();
          })();
        }}
        className="w-full text-left px-3 min-h-11 flex items-center rounded-sm hover:bg-muted text-sm transition-colors"
      >
        {labelSignOut}
      </button>
    </div>
  );
}

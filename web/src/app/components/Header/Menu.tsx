'use client';

import { useI18n } from '../../i18n/useI18n';
import { THEME_PREFERENCES, useTheme } from '../../useTheme';
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
    // Full width with equal segments, rather than sized to its contents:
    // the labels are language names, which are never translated and so
    // can't be budgeted for. Sitting beside the caption, the pair fit in
    // German and were clipped by the menu's edge in English (#242).
    <div className="flex w-full rounded-lg border overflow-hidden">
      {options.map((option) => (
        <button
          key={option}
          type="button"
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
  const { t, lang, setLang } = useI18n();
  const { preference, setThemePreference } = useTheme();
  if (!open) return null;
  const menuId = 'user-menu';

  return (
    <div
      id={menuId}
      aria-labelledby="user-menu-button"
      className="absolute right-0 mt-2 w-56 rounded-sm border bg-card text-card-foreground backdrop-blur p-1 shadow-lg"
    >
      <div className="px-3 py-2 font-label text-[0.6875rem] text-muted-foreground truncate">
        {user.email}
      </div>

      {/* Caption above rather than beside, so the control gets the menu's
          full width and the layout doesn't depend on how long any
          translation of "Language" happens to be. */}
      <div className="px-3 py-2 space-y-1.5">
        <span className="block text-sm">{t('header.language')}</span>
        <SegmentedControl
          value={lang}
          options={['de', 'en']}
          labels={{ de: 'Deutsch', en: 'English' }}
          onChange={setLang}
        />
      </div>

      {/* Same shape as the language control directly above it: caption on
          its own line, segments sharing the menu's full width. Three
          segments rather than two, and the labels are translated, so
          neither German nor English can crowd the row. */}
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
        />
      </div>

      <div className="my-1 border-t" />

      <button
        type="button"
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

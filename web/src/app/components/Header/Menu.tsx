'use client';

import Link from 'next/link';

import { useI18n } from '../../i18n/useI18n';
import { THEME_PREFERENCES, useTheme } from '../../useTheme';
import type { MenuProps } from './types';
import { labelClasses } from '../ui/labelClasses';
import { BackgroundRemovalSetting } from '../BackgroundRemoval/BackgroundRemovalSetting';

const MENU_ITEM =
  'w-full text-left px-3 min-h-11 flex items-center rounded-sm text-sm transition-colors';

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
  onDeleteAccount,
  onClose,
  onOpenHelp,
}: MenuProps) {
  const { t, language, setLanguage } = useI18n();
  const { preference, setThemePreference } = useTheme();
  if (!open) return null;
  const menuId = 'user-menu';

  return (
    <div
      id={menuId}
      data-testid="user-menu"
      aria-labelledby="user-menu-button"
      className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-sm border bg-card text-card-foreground backdrop-blur p-1 shadow-lg"
    >
      <div className={labelClasses('px-3 py-2 truncate')}>{user.email}</div>

      {/* Caption above, not beside: the layout must not depend on a translation's length. */}
      <div className="px-3 py-2 space-y-1.5">
        <span className="block text-sm">{t('header.language')}</span>
        <SegmentedControl
          value={language}
          options={['de', 'en']}
          labels={{ de: t('header.language_de'), en: t('header.language_en') }}
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

      <BackgroundRemovalSetting />

      <div className="my-1 border-t" />

      <button
        type="button"
        data-testid="open-help"
        onClick={onOpenHelp}
        aria-keyshortcuts="Control+/ Meta+/"
        className={`${MENU_ITEM} justify-between gap-3 hover:bg-muted`}
      >
        {t('header.help')}
        {/* Hidden from the name: aria-keyshortcuts already announces it. */}
        <kbd aria-hidden="true" className={labelClasses()}>
          {t('header.help_shortcut')}
        </kbd>
      </button>

      <Link
        href="/privacy"
        data-testid="menu-privacy-link"
        onClick={onClose}
        className={`${MENU_ITEM} hover:bg-muted`}
      >
        {t('privacy.link')}
      </Link>

      <button
        type="button"
        data-testid="sign-out"
        onClick={() => {
          void (async () => {
            await onSignOut();
            onClose();
          })();
        }}
        className={`${MENU_ITEM} hover:bg-muted`}
      >
        {t('header.sign_out')}
      </button>

      <div className="my-1 border-t" />

      <button
        type="button"
        data-testid="delete-account"
        onClick={onDeleteAccount}
        className={`${MENU_ITEM} hover:bg-destructive/10 text-destructive`}
      >
        {t('header.delete_account')}
      </button>
    </div>
  );
}

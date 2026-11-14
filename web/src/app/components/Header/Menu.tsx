'use client';

import Link from 'next/link';

import { useI18n } from '../../i18n/useI18n';
import { THEME_PREFERENCES, useTheme } from '../../useTheme';
import { PHOTO_BACKDROPS, usePhotoBackdrop } from '../../lib/usePhotoBackdrop';
import Icon, { IconType } from '../Icon';
import type { MenuProps } from './types';
import { labelClasses } from '../ui/labelClasses';
import { BackgroundRemovalSetting } from '../BackgroundRemoval/BackgroundRemovalSetting';
import { PasskeySetting } from './PasskeySetting';

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
  onDismiss,
  onOpenHelp,
}: MenuProps) {
  const { t, language, setLanguage } = useI18n();
  const { preference, setThemePreference } = useTheme();
  const { backdrop, setPhotoBackdrop } = usePhotoBackdrop();
  if (!open) return null;
  const menuId = 'user-menu';

  return (
    // The whole screen on a phone, where a dropdown leaves its controls too small; a dropdown from `sm` up.
    <div
      id={menuId}
      data-testid="user-menu"
      aria-labelledby="user-menu-button"
      className="fixed inset-0 z-modal overflow-y-auto overscroll-contain bg-card text-card-foreground p-1 pt-[max(0.25rem,env(safe-area-inset-top))] pb-[max(0.25rem,env(safe-area-inset-bottom))] sm:absolute sm:inset-auto sm:right-0 sm:mt-2 sm:w-72 sm:max-w-[calc(100vw-2rem)] sm:overflow-visible sm:rounded-sm sm:border sm:p-1 sm:shadow-lg sm:backdrop-blur"
    >
      <div className="flex items-center gap-2">
        <div className={labelClasses('flex-1 min-w-0 px-3 py-2 truncate')}>
          {user.email}
        </div>
        <button
          type="button"
          data-testid="close-user-menu"
          onClick={onDismiss}
          aria-label={t('header.close_menu')}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm hover:bg-muted transition-colors sm:hidden"
        >
          <Icon icon={IconType.Close} className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

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

      <div className="px-3 py-2 space-y-1.5">
        <span className="block text-sm">{t('header.photo_backdrop')}</span>
        <SegmentedControl
          value={backdrop}
          options={PHOTO_BACKDROPS}
          labels={{
            theme: t('header.photo_backdrop_theme'),
            black: t('header.photo_backdrop_black'),
            white: t('header.photo_backdrop_white'),
          }}
          onChange={setPhotoBackdrop}
          testIdPrefix="photo-backdrop"
        />
      </div>

      <BackgroundRemovalSetting />

      {/* Auth saves a passkey only for a confirmed email; the demo's anonymous user has none. */}
      {user.email && <PasskeySetting />}

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

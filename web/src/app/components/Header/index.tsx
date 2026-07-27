'use client';
import Image from 'next/image';
import { useI18n } from '../../i18n/useI18n';
import Icon, { IconType } from '../Icon';
import { HeaderProps } from './types';
import { useMenu } from './useMenu';
import Menu from './Menu';

const withBasePath = (path: string): string => {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${basePath}${normalizedPath}`;
};

export default function Header({ user, onSignOut }: HeaderProps) {
  const { open: menuOpen, toggle, close, anchorRef, panelRef } = useMenu();
  const { t } = useI18n();
  const displayEmail = user.email ?? '';

  return (
    <header
      className="sticky top-0 z-header backdrop-blur
        supports-[backdrop-filter]:bg-white/40
        dark:supports-[backdrop-filter]:bg-neutral-900/70
        border-b border-black/5 dark:border-white/10
        pt-[env(safe-area-inset-top)]"
    >
      <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Image
            src={withBasePath('/logo.png')}
            alt={t('header.title')}
            width={28}
            height={28}
            className="object-contain"
            priority
          />
          <span className="font-semibold tracking-tight">
            {t('header.title')}
          </span>
        </div>

        <div className="relative">
          <button
            ref={anchorRef}
            id="user-menu-button"
            onClick={toggle}
            className="group flex items-center gap-2 rounded-xl px-2.5 py-1.5
              bg-white/70 dark:bg-neutral-900/60
              border border-black/10 dark:border-white/10
              shadow-sm hover:shadow transition"
            aria-haspopup="menu"
            aria-controls="user-menu"
            aria-expanded={menuOpen ? 'true' : 'false'}
            title={displayEmail || t('header.title')}
          >
            <Icon icon={IconType.Google} className="w-5 h-5" />
            <span className="text-sm opacity-80 max-sm:hidden">
              {displayEmail}
            </span>
            <span className="text-xs opacity-60 group-hover:opacity-100">
              ▾
            </span>
          </button>

          <div ref={panelRef}>
            <Menu
              user={{ email: displayEmail }}
              open={menuOpen}
              onSignOut={onSignOut}
              onClose={close}
              labelSignOut={t('header.sign_out')}
            />
          </div>
        </div>
      </div>
    </header>
  );
}

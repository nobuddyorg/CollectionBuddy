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
        supports-[backdrop-filter]:bg-background/85
        border-b-2 border-primary/70
        pt-[env(safe-area-inset-top)]"
    >
      <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="inline-block w-3 h-3 rounded-full bg-primary shadow-[0_1px_2px_rgb(0_0_0/0.4)]"
          />
          <Image
            src={withBasePath('/logo.png')}
            alt=""
            width={26}
            height={26}
            className="object-contain"
            priority
          />
          <span className="font-display text-lg tracking-tight text-foreground">
            {t('header.title')}
          </span>
        </div>

        <div className="relative">
          <button
            ref={anchorRef}
            id="user-menu-button"
            onClick={toggle}
            className="group flex items-center gap-2 rounded-xl px-2.5 py-1.5
              bg-card/90 text-card-foreground
              border border-primary/40
              shadow-sm hover:shadow hover:border-primary transition"
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

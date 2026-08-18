'use client';
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
        supports-[backdrop-filter]:bg-background/90
        border-b border-border
        pt-[env(safe-area-inset-top)]"
    >
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element -- next/image
              earns nothing on this static export (images.unoptimized). */}
          <img
            src={withBasePath('/logo-header.png')}
            alt=""
            width={24}
            height={24}
            decoding="async"
            fetchPriority="high"
            className="object-contain shrink-0"
          />
          {/* The login page's wordmark at header scale. 2px rule, not the
              login page's 3px -- under 16px type that weight reads as a
              highlighter stroke. `pb-0.5` on the outer span keeps the rule
              visible past `truncate`'s clip. */}
          <span className="font-display text-base sm:text-lg text-foreground truncate pb-0.5">
            <span className="border-b-2 border-foreground pb-px">
              {t('brand.collection')}
            </span>
            <span className="text-accent">{t('brand.buddy')}</span>
          </span>
        </div>

        <div className="relative shrink-0">
          <button
            ref={anchorRef}
            id="user-menu-button"
            onClick={toggle}
            className="group flex items-center gap-2 rounded-sm px-2 min-h-10
              text-foreground hover:bg-muted transition-colors"
            aria-haspopup="true"
            aria-controls="user-menu"
            aria-expanded={menuOpen ? 'true' : 'false'}
            aria-label={t('header.account_menu')}
            title={displayEmail || t('header.title')}
          >
            <Icon icon={IconType.Google} className="w-5 h-5" />
            <span className="text-sm text-muted-foreground max-sm:hidden">
              {displayEmail}
            </span>
            <span className="text-xs text-muted-foreground">▾</span>
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

'use client';
import { useI18n } from '../../i18n/useI18n';
import { withBasePath } from '../../lib/env';
import Icon, { IconType } from '../Icon';
import { HeaderProps } from './types';
import { useMenu } from './useMenu';
import Menu from './Menu';

export default function Header({
  user,
  onSignOut,
  onDeleteAccount,
  onOpenHelp,
}: HeaderProps) {
  const { open: menuOpen, toggle, close, anchorRef, panelRef } = useMenu();
  const { t } = useI18n();

  const deleteAccount = () => {
    // The item unmounts with the menu, so the trigger is what the confirmation returns focus to.
    anchorRef.current!.focus();
    close();
    void onDeleteAccount();
  };

  const openHelp = () => {
    // The Help item unmounts with the menu, so the trigger is what the closing dialog returns focus to.
    anchorRef.current!.focus();
    close();
    onOpenHelp();
  };

  return (
    <header
      className="sticky top-0 z-header backdrop-blur
        supports-[backdrop-filter]:bg-background/90
        border-b border-border
        pt-[env(safe-area-inset-top)]"
    >
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element -- next/image earns nothing on a static export with images.unoptimized */}
          <img
            src={withBasePath('/logo-header.png')}
            alt=""
            width={24}
            height={24}
            decoding="async"
            fetchPriority="high"
            className="object-contain shrink-0"
          />
          {/* pb-0.5 on the outer span keeps the rule visible past truncate's clip. */}
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
            data-testid="account-menu"
            onClick={toggle}
            className="group flex items-center gap-2 rounded-sm px-2 min-h-10
              text-foreground hover:bg-muted transition-colors"
            aria-haspopup="true"
            aria-controls="user-menu"
            aria-expanded={menuOpen ? 'true' : 'false'}
            aria-label={t('header.account_menu')}
            title={user.email || t('header.title')}
          >
            <Icon icon={IconType.Google} className="w-5 h-5" />
            <span className="text-sm text-muted-foreground max-sm:hidden">
              {user.email}
            </span>
            <span className="text-xs text-muted-foreground">▾</span>
          </button>

          <div ref={panelRef}>
            <Menu
              user={user}
              open={menuOpen}
              onSignOut={onSignOut}
              onDeleteAccount={deleteAccount}
              onClose={close}
              onOpenHelp={openHelp}
            />
          </div>
        </div>
      </div>
    </header>
  );
}

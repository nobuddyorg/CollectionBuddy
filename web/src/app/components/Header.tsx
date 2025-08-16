'use client';
import { useState } from 'react';
import Image from 'next/image';
import type { User } from '../types';
import { useI18n } from '../hooks/useI18n';
import { withBasePath } from '../utils/path';
import Icon, { IconType } from './Icon';

type Props = {
  user: User;
  onSignOut: () => Promise<void> | void;
};

export default function Header({ user, onSignOut }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { t } = useI18n();

  return (
    <header
      className="sticky top-0 z-400 backdrop-blur
        supports-[backdrop-filter]:bg-white/40
        dark:supports-[backdrop-filter]:bg-neutral-900/70
        border-b border-black/5 dark:border-white/10"
    >
      <div className="mx-auto max-w-3xl px-4 py-3 flex items-center justify-between">
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
            onClick={() => setMenuOpen((v) => !v)}
            className="group flex items-center gap-2 rounded-xl px-2.5 py-1.5
              bg-white/70 dark:bg-neutral-900/60
              border border-black/10 dark:border-white/10
              shadow-sm hover:shadow transition"
          >
            <Icon icon={IconType.Google} className="w-5 h-5" />
            <span className="text-sm opacity-80 max-sm:hidden">
              {user.email}
            </span>
            <span className="text-xs opacity-60 group-hover:opacity-100">
              ▾
            </span>
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-2 w-56 rounded-xl
                border border-black/10 dark:border-white/10
                bg-white/90 dark:bg-neutral-900/90
                backdrop-blur p-1 shadow-lg"
            >
              <div className="px-3 py-2 text-xs opacity-70 truncate">
                {user.email}
              </div>
              <button
                onClick={onSignOut}
                className="w-full text-left px-3 py-2 rounded-lg
                  hover:bg-stone-100 dark:hover:bg-neutral-800 text-sm"
              >
                {t('header.sign_out')}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

'use client';
import { useState } from 'react';
import Image from 'next/image';
import type { User } from '../types';
import { useI18n } from '../hooks/useI18n';
import { withBasePath } from '../utils/path';

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
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 48 48"
              className="w-5 h-5"
            >
              <path
                fill="#EA4335"
                d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
              />
              <path
                fill="#4285F4"
                d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
              />
              <path
                fill="#FBBC05"
                d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
              />
              <path
                fill="#34A853"
                d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
              />
            </svg>
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

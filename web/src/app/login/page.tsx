'use client';

import { useMemo } from 'react';

import Coin from '../components/Coin/index';
import Collectible from '../components/Collectible/index';
import GoogleSignInButton from '../components/GoogleSignInButton/index';
import LoadingOverlay from '../components/LoadingOverlay';
import { useI18n } from '../i18n/useI18n';
import { useAuthRedirect } from './useAuthRedirect';
import { useGoogleSignIn } from './useGoogleSignIn';

const EMOJIS = [
  '🧸',
  '🪙',
  '📮',
  '🎟️',
  '💎',
  '🐚',
  '🎁',
  '🎖️',
  '🧩',
  '📀',
] as const;
const COLORS = ['#4285F4', '#EA4335', '#FBBC05', '#34A853'] as const;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (1664525 * s + 1013904223) >>> 0) / 2 ** 32;
}
function makePositions(count: number, seed = 1337, spread = 260) {
  const r = rng(seed);
  return Array.from({ length: count }, () => ({
    x: `${r() * (spread * 2) - spread}px`,
    y: `${r() * (spread * 2) - spread}px`,
  }));
}

export default function LoginPage() {
  const { t } = useI18n();
  const checking = useAuthRedirect('/');
  const signIn = useGoogleSignIn();
  const positions = useMemo(() => makePositions(16, 1337, 260), []);

  if (checking) return <LoadingOverlay label={t('item_list.loading')} />;

  return (
    <main className="relative min-h-[100dvh] flex flex-col items-center justify-center overflow-hidden px-4 bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] overscroll-y-contain">
      <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight mb-2 sm:mb-4 z-20 relative">
        <span className="text-neutral-900 dark:text-neutral-100">
          {t('login_page.title_collection')}
        </span>
        <span className="text-neutral-500 dark:text-neutral-400">
          {t('login_page.title_buddy')}
        </span>
      </h1>

      <div className="h-[3px] w-36 bg-gradient-to-r from-neutral-900 to-neutral-500 dark:from-neutral-100 dark:to-neutral-400 rounded-full mb-4 sm:mb-6 z-20 relative" />

      <Coin
        text={t('login_page.circle_text').repeat(2)}
        cta={<GoogleSignInButton onClick={signIn} />}
      />

      {positions.map((p, i) => (
        <Collectible
          key={i}
          delay={i * 0.35}
          color={COLORS[i % COLORS.length]}
          emoji={EMOJIS[i % EMOJIS.length]}
          x={p.x}
          y={p.y}
        />
      ))}

      <p className="fade-up mt-4 sm:mt-6 text-base sm:text-lg text-neutral-600 dark:text-neutral-300 text-center max-w-xl z-20 relative">
        {t('login_page.subtitle')}
      </p>
    </main>
  );
}

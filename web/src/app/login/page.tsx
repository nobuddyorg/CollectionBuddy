'use client';

import { useMemo } from 'react';

import Coin from '../components/Coin/index';
import Collectible from '../components/Collectible/index';
import GoogleSignInButton from '../components/GoogleSignInButton/index';
import LoadingOverlay from '../components/LoadingOverlay';
import { useToast } from '../components/Toast/ToastProvider';
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
// The same five inks used for category tabs and item pins throughout the
// app -- the login page previews the real visual language, not a one-off.
const COLORS = ['#c1553b', '#5c7a5e', '#3b5c82', '#7a4b6b', '#c79a3b'] as const;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (1664525 * s + 1013904223) >>> 0) / 2 ** 32;
}

// An elliptical fan, not a random scatter: each card gets its own slice of
// the ring (so they never bunch up) plus a little jitter in angle and
// radius (so it doesn't look mechanically perfect). Wider than it is tall,
// so the cards spread out to the sides of the medallion instead of
// colliding with the wordmark above and the subtitle below.
function makePositions(count: number, seed = 1337) {
  const r = rng(seed);
  const slice = (Math.PI * 2) / count;
  const rx = { min: 250, max: 390 };
  const ry = { min: 130, max: 195 };
  return Array.from({ length: count }, (_, i) => {
    const angle = slice * i + (r() - 0.5) * slice * 0.6;
    const rxV = rx.min + r() * (rx.max - rx.min);
    const ryV = ry.min + r() * (ry.max - ry.min);
    return {
      x: `${Math.round(Math.cos(angle) * rxV)}px`,
      y: `${Math.round(Math.sin(angle) * ryV)}px`,
    };
  });
}

export default function LoginPage() {
  const { t } = useI18n();
  const toast = useToast();
  const checking = useAuthRedirect('/');
  const signIn = useGoogleSignIn();

  const handleSignInError = (err: unknown) => {
    console.error('Google sign-in failed:', err);
    toast.error(t('login_page.sign_in_error'));
  };
  const positions = useMemo(() => makePositions(EMOJIS.length, 1337), []);

  if (checking)
    return <LoadingOverlay label={t('item_list.loading')} theme="auto" />;

  return (
    <main className="relative min-h-[100dvh] flex flex-col items-center justify-center overflow-hidden px-4 bg-background text-foreground pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] overscroll-y-contain">
      <h1 className="font-display text-5xl sm:text-6xl tracking-tight mb-2 sm:mb-4 z-20 relative">
        <span className="text-foreground">
          {t('login_page.title_collection')}
        </span>
        <span className="text-primary">{t('login_page.title_buddy')}</span>
      </h1>

      <div className="h-[3px] w-36 bg-primary rounded-full mb-4 sm:mb-6 z-20 relative" />

      <Coin
        text={t('login_page.circle_text').repeat(2)}
        textClassName="fill-primary/70"
        fontFamily="var(--font-label-family), monospace"
        cta={
          <GoogleSignInButton onClick={signIn} onError={handleSignInError} />
        }
      />

      {/* The fanned specimen cards need real width to fan into without
          clipping -- below `sm` they'd just crowd the edges, so the
          medallion carries the page alone on narrow screens. */}
      <div className="hidden sm:contents">
        {positions.map((p, i) => (
          <Collectible
            key={i}
            delay={i * 0.35}
            color={COLORS[i % COLORS.length]}
            emoji={EMOJIS[i % EMOJIS.length]}
            x={p.x}
            y={p.y}
            variant="bob"
          />
        ))}
      </div>

      <p className="fade-up mt-4 sm:mt-6 text-base sm:text-lg text-foreground/70 text-center max-w-xl z-20 relative">
        {t('login_page.subtitle')}
      </p>
    </main>
  );
}

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

function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (1664525 * s + 1013904223) >>> 0) / 2 ** 32;
}

// An elliptical fan, not a random scatter: each chip gets its own slice of
// the ring so they never bunch up, with a little jitter so it doesn't read
// as mechanically perfect. Wider than tall, to clear the wordmark above and
// the subtitle below.
function makePositions(count: number, seed = 1337) {
  const r = rng(seed);
  const slice = (Math.PI * 2) / count;
  return Array.from({ length: count }, (_, i) => {
    const angle = slice * i + (r() - 0.5) * slice * 0.6;
    const rx = 250 + r() * 140;
    const ry = 150 + r() * 60;
    return {
      x: `${Math.round(Math.cos(angle) * rx)}px`,
      y: `${Math.round(Math.sin(angle) * ry)}px`,
    };
  });
}

export default function LoginPage() {
  const { t } = useI18n();
  const toast = useToast();
  const checking = useAuthRedirect('/');
  const signIn = useGoogleSignIn();
  const positions = useMemo(() => makePositions(EMOJIS.length), []);

  const handleSignInError = (err: unknown) => {
    console.error('Google sign-in failed:', err);
    toast.error(t('login_page.sign_in_error'));
  };

  if (checking)
    return <LoadingOverlay label={t('item_list.loading')} theme="auto" />;

  return (
    <main className="relative min-h-[100dvh] flex flex-col items-center justify-center overflow-hidden px-6 bg-background text-foreground pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      {/* "Collection" is underscored in ink and "Buddy" carries the accent,
          so the two halves of the name read as two things joined -- the
          catalogue and the companion. */}
      <h1 className="font-display text-4xl sm:text-5xl mb-3 text-center">
        <span className="border-b-[3px] border-foreground pb-0.5">
          {t('login_page.title_collection')}
        </span>
        <span className="text-accent">{t('login_page.title_buddy')}</span>
      </h1>

      <p className="font-label text-[0.6875rem] text-muted-foreground text-center mt-2 mb-8 sm:mb-10">
        {t('page.footer')}
      </p>

      {/* The engraved medallion is the one piece of ornament on the page,
          and the sign-in sits at its centre -- the single thing to do. */}
      <Coin
        text={t('login_page.circle_text')}
        cta={
          <GoogleSignInButton onClick={signIn} onError={handleSignInError} />
        }
      />

      {/* The chips need real width to fan into without clipping; below `sm`
          the medallion carries the page on its own. */}
      <div className="hidden sm:contents">
        {positions.map((p, i) => (
          <Collectible
            key={i}
            delay={i * 0.35}
            emoji={EMOJIS[i % EMOJIS.length]}
            x={p.x}
            y={p.y}
          />
        ))}
      </div>

      <p className="mt-8 sm:mt-10 text-sm sm:text-base text-muted-foreground text-center max-w-sm text-balance">
        {t('login_page.subtitle')}
      </p>
    </main>
  );
}

'use client';

import { useEffect, useMemo, type CSSProperties } from 'react';

import Coin from '../components/Coin';
import { coinSizeCss } from '../components/Coin/size';
import Collectible from '../components/Collectible';
import GoogleSignInButton from '../components/GoogleSignInButton';
import LoadingOverlay from '../components/LoadingOverlay';
import { useToast } from '../components/Toast/ToastProvider';
import { useI18n } from '../i18n/useI18n';
import { fanOffsetX, fanOffsetY, fanPositions } from './collectibleFan';
import { useAuthRedirect } from './useAuthRedirect';
import { isDemoMode, useDemoSignIn } from './useDemoSignIn';
import { useGoogleSignIn } from './useGoogleSignIn';

const EMOJIS = ['🪙', '📮', '🎟️', '🐚', '🎖️', '🧩', '📀'] as const;

const COIN_SIZE = 420;

// Sets --coin-size, which fanPositions/fanOffsetX/fanOffsetY read to size
// chip offsets relative to the coin.
const COIN_BOX = {
  ['--coin-size']: coinSizeCss(COIN_SIZE),
} as CSSProperties;

export default function LoginPage() {
  const { t } = useI18n();
  const toast = useToast();
  const checking = useAuthRedirect('/');
  const signIn = useGoogleSignIn();
  const demoMode = isDemoMode();
  const { error: demoError } = useDemoSignIn(demoMode && !checking);
  const positions = useMemo(() => fanPositions(EMOJIS.length), []);

  const handleSignInError = (err: unknown) => {
    toast.reportError('google sign-in', err, t('login_page.sign_in_error'));
  };

  useEffect(() => {
    if (demoError) {
      toast.reportError(
        'demo sign-in',
        demoError,
        t('login_page.sign_in_error'),
      );
    }
  }, [demoError, t, toast]);

  // While demo mode is signing the visitor in there is no login screen to
  // show; a failed attempt (e.g. this build pointed at a Supabase project
  // with anonymous sign-ins turned off) falls back to the Google button
  // below rather than leaving the overlay up forever.
  if (checking || (demoMode && !demoError))
    return <LoadingOverlay label={t('item_list.loading')} theme="auto" />;

  return (
    <main className="relative min-h-[100dvh] flex flex-col items-center justify-center overflow-hidden px-6 bg-background text-foreground pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <h1 className="font-display text-4xl sm:text-5xl mb-3 text-center">
        <span className="border-b-[3px] border-foreground pb-0.5">
          {t('brand.collection')}
        </span>
        <span className="text-accent">{t('brand.buddy')}</span>
      </h1>

      <p className="font-label text-[0.6875rem] text-muted-foreground text-center mt-2 mb-8 sm:mb-10">
        {t('page.footer')}
      </p>

      {/* Chips are positioned against this box, not the page, so their
          offsets stay relative to the coin wherever it drifts on screen. */}
      <div className="relative" style={COIN_BOX}>
        <Coin
          size={COIN_SIZE}
          text={t('login_page.circle_text')}
          cta={
            <GoogleSignInButton onClick={signIn} onError={handleSignInError} />
          }
        />

        {/* The chips need real width to fan into without clipping; below
            `sm` the medallion carries the page on its own. */}
        <div className="hidden sm:contents">
          {positions.map((p, i) => (
            <Collectible
              key={i}
              delay={i * 0.35}
              emoji={EMOJIS[i % EMOJIS.length]}
              x={fanOffsetX(p.ux)}
              y={fanOffsetY(p.uy)}
            />
          ))}
        </div>
      </div>

      <p className="mt-8 sm:mt-10 text-sm sm:text-base text-muted-foreground text-center max-w-sm text-balance">
        {t('login_page.subtitle')}
      </p>
    </main>
  );
}

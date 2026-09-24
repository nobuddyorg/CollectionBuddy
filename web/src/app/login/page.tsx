'use client';

import { useEffect, useMemo, type CSSProperties } from 'react';

import Coin from '../components/Coin';
import { coinSizeCss } from '../components/Coin/size';
import Collectible from '../components/Collectible';
import GoogleSignInButton from '../components/GoogleSignInButton';
import LoadingOverlay from '../components/LoadingOverlay';
import { labelClasses } from '../components/ui/labelClasses';
import { useToast } from '../components/Toast/ToastProvider';
import { useI18n } from '../i18n/useI18n';
import { fanOffsetX, fanOffsetY, fanPositions } from './collectibleFan';
import { useAuthRedirect } from './useAuthRedirect';
import { isDemoMode, useDemoSignIn } from './useDemoSignIn';
import { useGoogleSignIn } from './useGoogleSignIn';

const EMOJIS = ['🪙', '📮', '🎟️', '🐚', '🎖️', '🧩', '📀'] as const;

const COIN_SIZE = 420;

// Publishes --coin-size, which fanOffsetX/fanOffsetY read.
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

  const handleSignInError = (error: unknown) => {
    toast.reportError('google sign-in', error, t('login_page.sign_in_error'));
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

  // A failed demo sign-in (e.g. anonymous sign-ins off) falls back to the Google button, not an endless overlay.
  if (checking || (demoMode && !demoError))
    return <LoadingOverlay label={t('item_list.loading')} theme="auto" />;

  return (
    <main className="relative min-h-[100dvh] flex flex-col items-center justify-center overflow-hidden px-6 bg-background text-foreground pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <h1
        data-testid="wordmark"
        className="font-display text-4xl sm:text-5xl mb-3 text-center"
      >
        <span
          data-testid="wordmark-part"
          className="border-b-[3px] border-foreground pb-0.5"
        >
          {t('brand.collection')}
        </span>
        <span data-testid="wordmark-part" className="text-accent">
          {t('brand.buddy')}
        </span>
      </h1>

      <p
        data-testid="tagline"
        className={labelClasses('text-center mt-2 mb-8 sm:mb-10')}
      >
        {t('page.footer')}
      </p>

      {/* Chips are positioned against this box, not the page, so their offsets stay relative to the coin. */}
      <div className="relative" style={COIN_BOX}>
        <Coin
          size={COIN_SIZE}
          text={t('login_page.circle_text')}
          cta={
            <GoogleSignInButton onClick={signIn} onError={handleSignInError} />
          }
        />

        {/* Below `sm` there is no width to fan into without clipping; the medallion carries the page alone. */}
        <div className="hidden sm:contents">
          {positions.map((position, i) => (
            <Collectible
              key={i}
              delay={i * 0.35}
              emoji={EMOJIS[i % EMOJIS.length]}
              x={fanOffsetX(position.ux)}
              y={fanOffsetY(position.uy)}
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

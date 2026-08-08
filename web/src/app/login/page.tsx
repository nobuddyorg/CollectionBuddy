'use client';

import { useMemo, type CSSProperties } from 'react';

import Coin from '../components/Coin/index';
import { coinSizeCss } from '../components/Coin/size';
import Collectible from '../components/Collectible/index';
import GoogleSignInButton from '../components/GoogleSignInButton/index';
import LoadingOverlay from '../components/LoadingOverlay';
import { useToast } from '../components/Toast/ToastProvider';
import { useI18n } from '../i18n/useI18n';
import { fanOffsetX, fanOffsetY, fanPositions } from './collectibleFan';
import { useAuthRedirect } from './useAuthRedirect';
import { useGoogleSignIn } from './useGoogleSignIn';

// A fixed, curated set rather than a random pull from a larger pool: the
// same seven objects greet a visitor every time, so the medallion reads as
// a considered display case rather than a slot machine.
const EMOJIS = ['🪙', '📮', '🎟️', '🐚', '🎖️', '🧩', '📀'] as const;

const COIN_SIZE = 420;

// Published to the fan as a custom property, so the chips are laid out in
// units of the coin they have to clear.
const COIN_BOX = {
  ['--coin-size']: coinSizeCss(COIN_SIZE),
} as CSSProperties;

export default function LoginPage() {
  const { t } = useI18n();
  const toast = useToast();
  const checking = useAuthRedirect('/');
  const signIn = useGoogleSignIn();
  const positions = useMemo(() => fanPositions(EMOJIS.length), []);

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
          {t('brand.collection')}
        </span>
        <span className="text-accent">{t('brand.buddy')}</span>
      </h1>

      <p className="font-label text-[0.6875rem] text-muted-foreground text-center mt-2 mb-8 sm:mb-10">
        {t('page.footer')}
      </p>

      {/* The engraved medallion is the one piece of ornament on the page,
          and the sign-in sits at its centre -- the single thing to do.
          The chips are positioned against this box rather than against the
          page, so "around the coin" is measured from the coin: centred on
          the page, they orbited a point the medallion had drifted away
          from and settled on top of it. */}
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

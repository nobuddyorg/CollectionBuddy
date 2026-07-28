'use client';

import Coin from '../components/Coin/index';
import GoogleSignInButton from '../components/GoogleSignInButton/index';
import LoadingOverlay from '../components/LoadingOverlay';
import { useToast } from '../components/Toast/ToastProvider';
import { useI18n } from '../i18n/useI18n';
import { useAuthRedirect } from './useAuthRedirect';
import { useGoogleSignIn } from './useGoogleSignIn';

export default function LoginPage() {
  const { t } = useI18n();
  const toast = useToast();
  const checking = useAuthRedirect('/');
  const signIn = useGoogleSignIn();

  const handleSignInError = (err: unknown) => {
    console.error('Google sign-in failed:', err);
    toast.error(t('login_page.sign_in_error'));
  };

  if (checking)
    return <LoadingOverlay label={t('item_list.loading')} theme="auto" />;

  return (
    <main className="relative min-h-[100dvh] flex flex-col items-center justify-center overflow-hidden px-6 bg-background text-foreground pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <h1 className="font-display text-4xl sm:text-5xl mb-3 text-center">
        {t('login_page.title_collection')}
        {t('login_page.title_buddy')}
      </h1>

      <p className="font-label text-[0.6875rem] text-muted-foreground text-center mb-8 sm:mb-10">
        {t('page.footer')}
      </p>

      {/* The engraved medallion is the one piece of ornament on the page,
          and the sign-in sits at its centre -- the single thing to do. */}
      <Coin
        text={t('login_page.circle_text').repeat(2)}
        cta={
          <GoogleSignInButton onClick={signIn} onError={handleSignInError} />
        }
      />

      <p className="mt-8 sm:mt-10 text-sm sm:text-base text-muted-foreground text-center max-w-sm text-balance">
        {t('login_page.subtitle')}
      </p>
    </main>
  );
}

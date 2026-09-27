'use client';
import { useRouter } from 'next/navigation';

import { useToast } from './components/Toast/ToastProvider';
import { useI18n } from './i18n/useI18n';
import { forgetStoredSession, supabase } from './supabase';
import { forgetUserData } from './userData';

export function useSignOut() {
  const router = useRouter();
  const { t } = useI18n();
  const toast = useToast();

  return async () => {
    try {
      // A delete still inside its undo window would otherwise run later as anon, and fail.
      await toast.commitPending();
      // Global sign-out revokes the refresh token server-side.
      const { error } = await supabase.auth.signOut();
      if (error) {
        toast.reportError('sign out failed', error, t('header.sign_out_error'));
      }
    } catch (error) {
      toast.reportError(
        'sign out unexpected error',
        error,
        t('header.sign_out_error'),
      );
    } finally {
      // auth-js returns an error but keeps the session when an expired one cannot refresh offline; none may outlive this.
      forgetStoredSession();
      // The session is over either way; the next person at this browser gets none of its places or links.
      forgetUserData();
      router.replace('/login');
    }
  };
}

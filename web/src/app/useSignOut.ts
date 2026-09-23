'use client';
import { useCallback } from 'react';
import { useRouter } from 'next/navigation';

import { useToast } from './components/Toast/ToastProvider';
import { useI18n } from './i18n/useI18n';
import { supabase } from './supabase';

export function useSignOut() {
  const router = useRouter();
  const { t } = useI18n();
  const toast = useToast();

  return useCallback(async () => {
    try {
      // Global sign-out revokes the refresh token server-side; on failure a local clear still ends it here.
      const { error } = await supabase.auth.signOut();
      if (error) {
        toast.reportError('sign out failed', error, t('header.sign_out_error'));
        await supabase.auth.signOut({ scope: 'local' });
      }
    } catch (error) {
      toast.reportError(
        'sign out unexpected error',
        error,
        t('header.sign_out_error'),
      );
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    } finally {
      router.replace('/login');
    }
  }, [router, t, toast]);
}

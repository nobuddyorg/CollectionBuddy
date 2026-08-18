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
      // Global scope revokes the refresh token server-side; fall back to a
      // local clear on failure so a network error can't leave the user
      // signed in on this device.
      const { error } = await supabase.auth.signOut();
      if (error) {
        toast.reportError('sign out failed', error, t('header.sign_out_error'));
        await supabase.auth.signOut({ scope: 'local' });
      }
    } catch (err) {
      toast.reportError(
        'sign out unexpected error',
        err,
        t('header.sign_out_error'),
      );
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    } finally {
      router.replace('/login');
    }
  }, [router, t, toast]);
}

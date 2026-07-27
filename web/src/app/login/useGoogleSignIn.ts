'use client';

import { useCallback } from 'react';

import { supabase } from '../supabase';

export function useGoogleSignIn() {
  return useCallback(async () => {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
    const url = new URL(basePath || '/', window.location.origin);
    // signInWithOAuth resolves with { error } instead of throwing, so a
    // discarded promise here means offline/misconfigured-provider failures
    // never reach GoogleSignInButton's catch, leaving its loading overlay
    // stuck forever with no error shown.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: url.toString() },
    });
    if (error) throw error;
  }, []);
}

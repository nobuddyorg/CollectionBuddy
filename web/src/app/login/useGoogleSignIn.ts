'use client';

import { useCallback } from 'react';

import { supabase } from '../supabase';

export function useGoogleSignIn() {
  return useCallback(async () => {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
    const url = new URL(basePath || '/', window.location.origin);
    // signInWithOAuth resolves with { error } instead of throwing; if this
    // promise isn't awaited, failures never reach the caller's catch and
    // GoogleSignInButton's loading overlay is stuck with no error shown.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: url.toString() },
    });
    if (error) throw error;
  }, []);
}

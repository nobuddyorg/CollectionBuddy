'use client';

import { useCallback } from 'react';

import { basePath } from '../lib/env';
import { supabase } from '../supabase';

export function useGoogleSignIn() {
  return useCallback(async () => {
    const url = new URL(basePath() || '/', window.location.origin);
    // Awaited because signInWithOAuth resolves with { error } instead of throwing; the overlay would hang.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: url.toString() },
    });
    if (error) throw error;
  }, []);
}

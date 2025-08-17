'use client';

import { useCallback } from 'react';

import { supabase } from '../supabase';

export function useGoogleSignIn() {
  return useCallback(() => {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
    const url = new URL(basePath || '/', window.location.origin);
    void supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: url.toString() },
    });
  }, []);
}

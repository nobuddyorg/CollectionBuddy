'use client';

import { useEffect, useRef, useState } from 'react';

import { supabase } from '../supabase';

// Literal `process.env.NEXT_PUBLIC_X` access, same as supabase.ts and
// useServiceWorker.ts -- a computed lookup wouldn't be inlined into the
// static export.
export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
}

// Signs the visitor in as a fresh anonymous Supabase user the moment demo
// mode is active and no session exists yet. Runs at most once per mount --
// the resulting SIGNED_IN event is what useAuthRedirect acts on, so this
// hook itself never navigates.
export function useDemoSignIn(active: boolean) {
  const [error, setError] = useState<unknown>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!active || started.current) return;
    started.current = true;
    void supabase.auth.signInAnonymously().then(({ error }) => {
      if (error) setError(error);
    });
  }, [active]);

  return { error };
}

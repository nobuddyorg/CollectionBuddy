'use client';

import { useEffect, useRef, useState } from 'react';

import { supabase } from '../supabase';

// Read as a literal `process.env.NEXT_PUBLIC_X` expression, the only form Next's static export inlines.
export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
}

// Runs at most once per mount; the resulting SIGNED_IN event is what useAuthRedirect acts on.
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

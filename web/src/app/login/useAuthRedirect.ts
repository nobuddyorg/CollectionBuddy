'use client';

import { useEffect, useState } from 'react';

import { useRouter } from 'next/navigation';

import { supabase } from '../supabase';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

export function useAuthRedirect(redirectTo: string) {
  const [checking, setChecking] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const handler = (_: AuthChangeEvent, session: Session | null) => {
      if (session) router.replace(redirectTo);
    };
    const { data: authListener } = supabase.auth.onAuthStateChange(handler);

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace(redirectTo);
      else setChecking(false);
    });

    return () => authListener.subscription.unsubscribe();
  }, [router, redirectTo]);

  return checking;
}

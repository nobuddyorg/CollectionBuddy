'use client';

import { useEffect, useState } from 'react';

import { supabase } from './supabase';
import { SessionUser } from './types';

type SessionState = { user: SessionUser | null; loading: boolean };

export function useSession(): SessionState {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      const u = data.user;
      setUser(
        u
          ? {
              id: u.id,
              email: u.email ?? null,
              name: u.user_metadata?.name ?? null,
            }
          : null,
      );
      setLoading(false);
    };
    load();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user;
      setUser(
        u
          ? {
              id: u.id,
              email: u.email ?? null,
              name: u.user_metadata?.name ?? null,
            }
          : null,
      );
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
}

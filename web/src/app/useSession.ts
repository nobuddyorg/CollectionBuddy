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
      // getSession() reads the session already persisted locally, no
      // network round trip -- getUser() re-validates against the auth
      // server, which held up the very first paint behind a full request
      // and, transitively, every fetch gated on it (categories, items,
      // images). onAuthStateChange below still fires for any subsequent
      // change, including a session that turns out to be stale.
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      const u = data.session?.user;
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

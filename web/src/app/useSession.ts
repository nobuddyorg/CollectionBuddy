'use client';

import { useEffect, useState } from 'react';

import { supabase } from './supabase';
import { SessionUser } from './types';
import type { User } from '@supabase/supabase-js';

type SessionState = { user: SessionUser | null; loading: boolean };

// user_metadata is an untyped bag from the auth provider, so `name` is
// narrowed here rather than trusted as a string.
function sessionUserFrom(user: User | undefined): SessionUser | null {
  if (!user) return null;
  const name: unknown = user.user_metadata?.name;
  return {
    id: user.id,
    email: user.email ?? null,
    name: typeof name === 'string' ? name : null,
  };
}

export function useSession(): SessionState {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      // getSession() reads the persisted session locally, no network round
      // trip; getUser() would revalidate and block first paint.
      // onAuthStateChange below still catches a session that turns out
      // to be stale.
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setUser(sessionUserFrom(data.session?.user));
      setLoading(false);
    };
    void load();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(sessionUserFrom(session?.user));
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
}

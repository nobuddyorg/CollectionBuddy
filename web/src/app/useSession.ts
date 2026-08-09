'use client';

import { useEffect, useState } from 'react';

import { supabase } from './supabase';
import { SessionUser } from './types';
import type { User } from '@supabase/supabase-js';

type SessionState = { user: SessionUser | null; loading: boolean };

// user_metadata is an untyped bag from the auth provider's own response, so
// `name` is `any` as far as the compiler knows -- narrowed here rather than
// trusted, since Google is the one populating it and this is the only place
// that reads it.
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
      // getSession() reads the session already persisted locally, no
      // network round trip -- getUser() re-validates against the auth
      // server, which held up the very first paint behind a full request
      // and, transitively, every fetch gated on it (categories, items,
      // images). onAuthStateChange below still fires for any subsequent
      // change, including a session that turns out to be stale.
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

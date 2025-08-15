'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';
import type {
  Session,
  User as SupabaseUser,
  AuthChangeEvent,
} from '@supabase/supabase-js';
import type { User } from '../types';

function asUser(u: SupabaseUser | null): User | null {
  return u as unknown as User | null;
}

export function useSession() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const handleSession = (session: Session | null) => {
      if (!active) return;

      const nextUser = asUser(session?.user ?? null);
      setUser(nextUser);
      setLoading(false);
    };

    const fetchSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.error('Error fetching session:', error.message);
          handleSession(null);
        } else {
          handleSession(data.session);
        }
      } catch (err) {
        console.error('Unexpected error fetching session:', err);
        handleSession(null);
      }
    };

    fetchSession();

    const { data: sub } = supabase.auth.onAuthStateChange(
      (_e: AuthChangeEvent, s: Session | null) => handleSession(s),
    );

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      console.warn('Session invalid or expired. Redirecting to login.');
      router.replace('/login');
    }
  }, [user, loading, router]);

  return { user, loading };
}

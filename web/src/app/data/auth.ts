import { supabase } from '../supabase';

// Round-trips to the auth server rather than reading the cached session,
// before a caller writes bytes under a user-derived path. RLS and the
// storage policies are the actual security boundary, not this.
export async function verifiedUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

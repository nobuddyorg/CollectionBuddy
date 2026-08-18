import { supabase } from '../supabase';

// Cached session, no network round trip. RLS and storage policies are the
// actual security boundary, not this.
export async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

// Round-trips to the auth server (unlike currentUserId) before a caller
// writes bytes under a user-derived path.
export async function verifiedUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

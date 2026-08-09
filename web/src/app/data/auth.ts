import { supabase } from '../supabase';

// Local, no network round trip -- the right choice for a read path (listing,
// building a storage prefix) where a stale answer just means "try again a
// moment later." RLS and the storage policies are what actually decide what
// a user can reach; nothing here is a security boundary.
export async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

// Round-trips to the auth server rather than reading the cached session, for
// a caller about to write bytes under a user-derived path.
export async function verifiedUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

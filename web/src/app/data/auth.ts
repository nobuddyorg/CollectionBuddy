import { supabase } from '../supabase';

// Round-trips to the auth server before writing under a user-derived path; RLS is the boundary.
export async function verifiedUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

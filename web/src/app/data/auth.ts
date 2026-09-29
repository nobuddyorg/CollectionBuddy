import { isAuthRetryableFetchError, supabase } from '../supabase';

// Round-trips to the auth server before writing under a user-derived path; RLS is the boundary.
export async function verifiedUserId(): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser();
  if (isAuthRetryableFetchError(error)) throw error;
  return data.user?.id ?? null;
}

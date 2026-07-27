import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

export const supabase = createClient(url, anon, {
  auth: {
    // PKCE returns a single-use ?code= in the query string instead of putting
    // access and refresh tokens in the URL fragment. auth-js defaults to the
    // implicit flow, which leaks the refresh token to history and extensions.
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

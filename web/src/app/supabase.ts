import { createClient } from '@supabase/supabase-js';

import type { Database } from './data/database.types';

function requireEnv(
  name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name} -- copy web/.env.example to web/.env.local and fill it in (see README's "Local development" section).`,
    );
  }
  return value;
}

const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
const anon = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

export const supabase = createClient<Database>(url, anon, {
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

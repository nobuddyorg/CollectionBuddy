import { createClient } from '@supabase/supabase-js';

import type { Database } from './data/database.types';

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing ${name} -- copy web/.env.example to web/.env.local and fill it in (see README's "Local development" section).`,
    );
  }
  return value;
}

// Next's static export only inlines NEXT_PUBLIC_* vars into the client
// bundle when accessed as a literal `process.env.NEXT_PUBLIC_X` expression --
// a computed lookup (e.g. process.env[name]) can't be statically replaced
// and stays undefined in the browser.
const url = requireEnv(
  'NEXT_PUBLIC_SUPABASE_URL',
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);
const anon = requireEnv(
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

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

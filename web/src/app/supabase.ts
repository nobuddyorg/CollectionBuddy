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

// Read as a literal `process.env.NEXT_PUBLIC_X` expression, the only form Next's static export inlines.
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
    // auth-js defaults to the implicit flow, which leaks the refresh token to history via the URL fragment.
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

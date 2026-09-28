import { createClient } from '@supabase/supabase-js';

import type { Database } from './data/database.types';
import { removeStoredValue } from './lib/browserStorage';

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing ${name} -- copy web/.env.example to web/.env.local and fill it in (see CONTRIBUTING.md's "Local development" section).`,
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

// supabase-js's own default for this URL, spelled out so sessions stored before it survive and a sign-out can clear it.
export const AUTH_STORAGE_KEY = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;

/** Removes the stored session, which auth-js's sign-out leaves in place when it cannot refresh an expired one (offline). */
export function forgetStoredSession(): void {
  removeStoredValue(AUTH_STORAGE_KEY);
}

export const supabase = createClient<Database>(url, anon, {
  auth: {
    storageKey: AUTH_STORAGE_KEY,
    // auth-js defaults to the implicit flow, which leaks the refresh token to history via the URL fragment.
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

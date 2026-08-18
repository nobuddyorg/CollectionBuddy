'use client';

import { supabase } from './supabase';

/**
 * Renders nothing. Puts `./supabase` in the layout's own module graph so
 * Turbopack shares one copy of `@supabase/supabase-js` across routes,
 * instead of baking a separate copy into each route that imports it only
 * through `useSession`/`useAuthRedirect`.
 *
 * Sits beside `useSession.ts`/`supabase.ts` rather than under `components/`
 * because components are barred from importing `./supabase` directly
 * (`eslint.config.mjs`'s `no-restricted-imports`); this file is the same
 * kind of exception `useSession.ts` already is.
 *
 * The reference must be real, not a bare `import './supabase'` -- an
 * unused-binding import is exactly what tree-shaking is free to drop.
 */
export function SupabaseWarmup() {
  void supabase;
  return null;
}

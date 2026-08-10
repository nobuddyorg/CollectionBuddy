'use client';

import { supabase } from './supabase';

/**
 * Renders nothing. Exists only so the layout -- shared by every route --
 * has `./supabase` in its own module graph, rather than each route
 * importing it independently through `useSession`/`useAuthRedirect` (#328).
 *
 * Turbopack's chunk splitting hoists a module into the chunk shared across
 * routes when it is reachable from a shared entry point; a module each
 * route only reaches on its own gets a copy baked into that route's own
 * chunk instead. `/` and `/login` each pulled in the whole of
 * `@supabase/supabase-js` this way -- two ~60 KB gz copies of the same
 * library, paid in full on the very first navigation (sign-in ->
 * redirect). Referencing the client from here, which the layout renders
 * on every route, is what makes it shared instead.
 *
 * Sits beside `useSession.ts`/`supabase.ts` rather than under `components/`
 * on purpose: components are barred from importing `./supabase` directly
 * (`eslint.config.mjs`'s `no-restricted-imports`) precisely because they
 * are expected to go through `data/` -- this file is the same kind of
 * exception `useSession.ts` already is, not a component.
 *
 * The reference has to be a real one, not a bare `import './supabase'`: an
 * import with no binding used is exactly what a tree-shaking build is free
 * to drop, taking the fix with it.
 */
export function SupabaseWarmup() {
  void supabase;
  return null;
}

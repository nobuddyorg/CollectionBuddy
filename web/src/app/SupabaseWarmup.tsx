'use client';

import { supabase } from './supabase';

// Renders nothing; the un-shakeable reference makes Turbopack share one supabase-js copy across routes.
export function SupabaseWarmup() {
  void supabase;
  return null;
}

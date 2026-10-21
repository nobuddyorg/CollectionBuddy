import type { PasskeyListItem } from '@supabase/supabase-js';

import { supabase } from '../supabase';

export type Passkey = PasskeyListItem;

/** The signed-in user's passkeys, in the order Auth lists them. */
export async function listPasskeys(): Promise<
  { data: Passkey[]; error: null } | { data: null; error: unknown }
> {
  const { data, error } = await supabase.auth.passkey.list();
  if (error) return { data: null, error };
  return { data, error: null };
}

/** Runs the browser's prompt and stores the new passkey's public key with Auth, for the signed-in user. */
export async function registerPasskey(): Promise<{ error: unknown }> {
  const { error } = await supabase.auth.registerPasskey();
  return { error };
}

export async function deletePasskey(passkeyId: string): Promise<{
  error: unknown;
}> {
  const { error } = await supabase.auth.passkey.delete({ passkeyId });
  return { error };
}

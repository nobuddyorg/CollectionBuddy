'use client';

import { useCallback } from 'react';

import { isDismissedCeremony } from '../lib/passkeyCeremony';
import { supabase } from '../supabase';

/** Signs in with a passkey saved earlier; useAuthRedirect leaves the page on the SIGNED_IN event that follows. */
export function usePasskeySignIn() {
  return useCallback(async () => {
    const { error } = await supabase.auth.signInWithPasskey();
    if (error && !isDismissedCeremony(error)) throw error;
  }, []);
}

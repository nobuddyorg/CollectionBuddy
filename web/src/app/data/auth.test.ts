import type * as SupabaseJs from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { supabase } from '../supabase';
import { verifiedUserId } from './auth';

// A runtime import: a static value import of @supabase/* outside supabase.ts breaks the one-client rule.
const { AuthRetryableFetchError, AuthSessionMissingError } =
  await vi.importActual<typeof SupabaseJs>('@supabase/supabase-js');

function answering(response: unknown) {
  vi.spyOn(supabase.auth, 'getUser').mockResolvedValue(response as never);
}

describe('verifiedUserId', () => {
  it("returns the signed-in user's id", async () => {
    answering({ data: { user: { id: 'user-1' } }, error: null });

    await expect(verifiedUserId()).resolves.toBe('user-1');
  });

  it('reads a missing session as signed out', async () => {
    answering({ data: { user: null }, error: new AuthSessionMissingError() });

    await expect(verifiedUserId()).resolves.toBeNull();
  });

  // Read as signed out, an unreachable auth server would surface as "no session" rather than the outage.
  it('throws when the auth server cannot be reached', async () => {
    const unreachable = new AuthRetryableFetchError('Failed to fetch', 0);
    answering({ data: { user: null }, error: unreachable });

    await expect(verifiedUserId()).rejects.toBe(unreachable);
  });
});

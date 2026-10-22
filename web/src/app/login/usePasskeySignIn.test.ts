// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { supabase } from '../supabase';
import { usePasskeySignIn } from './usePasskeySignIn';

afterEach(() => {
  vi.restoreAllMocks();
});

function signInAnswers(error: unknown) {
  return vi
    .spyOn(supabase.auth, 'signInWithPasskey')
    .mockResolvedValue({ data: null, error } as never);
}

describe('usePasskeySignIn', () => {
  it('resolves once Auth has signed in', async () => {
    const signIn = signInAnswers(null);
    const { result } = renderHook(() => usePasskeySignIn());

    await expect(result.current()).resolves.toBeUndefined();
    expect(signIn).toHaveBeenCalledOnce();
  });

  it('throws what Auth refused', async () => {
    const error = Object.assign(new Error('not registered'), {
      code: 'webauthn_credential_not_found',
    });
    signInAnswers(error);
    const { result } = renderHook(() => usePasskeySignIn());

    await expect(result.current()).rejects.toBe(error);
  });

  it('stays quiet when the person closes the prompt', async () => {
    const cause = Object.assign(new Error('closed'), {
      name: 'NotAllowedError',
    });
    signInAnswers(new Error('ceremony failed', { cause }));
    const { result } = renderHook(() => usePasskeySignIn());

    await expect(result.current()).resolves.toBeUndefined();
  });
});

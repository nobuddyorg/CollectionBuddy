import { afterEach, describe, expect, it, vi } from 'vitest';

import { supabase } from '../supabase';
import { deletePasskey, listPasskeys, registerPasskey } from './passkeys';

afterEach(() => {
  vi.restoreAllMocks();
});

const PASSKEY = {
  id: 'passkey-1',
  friendly_name: 'Google Password Manager',
  created_at: '2026-10-21T10:00:00Z',
};

describe('listPasskeys', () => {
  it('hands back what Auth lists', async () => {
    vi.spyOn(supabase.auth.passkey, 'list').mockResolvedValue({
      data: [PASSKEY],
      error: null,
    });

    await expect(listPasskeys()).resolves.toEqual({
      data: [PASSKEY],
      error: null,
    });
  });

  it('hands back the error, with no list', async () => {
    const error = new Error('offline');
    vi.spyOn(supabase.auth.passkey, 'list').mockResolvedValue({
      data: null,
      error,
    } as never);

    await expect(listPasskeys()).resolves.toEqual({ data: null, error });
  });
});

describe('registerPasskey', () => {
  it('runs the whole ceremony through auth-js', async () => {
    const register = vi
      .spyOn(supabase.auth, 'registerPasskey')
      .mockResolvedValue({ data: PASSKEY, error: null });

    await expect(registerPasskey()).resolves.toEqual({ error: null });
    expect(register).toHaveBeenCalledOnce();
  });

  it('hands back the error', async () => {
    const error = new Error('dismissed');
    vi.spyOn(supabase.auth, 'registerPasskey').mockResolvedValue({
      data: null,
      error,
    } as never);

    await expect(registerPasskey()).resolves.toEqual({ error });
  });
});

describe('deletePasskey', () => {
  it('deletes the passkey it names', async () => {
    const remove = vi
      .spyOn(supabase.auth.passkey, 'delete')
      .mockResolvedValue({ data: null, error: null });

    await expect(deletePasskey('passkey-1')).resolves.toEqual({ error: null });
    expect(remove).toHaveBeenCalledWith({ passkeyId: 'passkey-1' });
  });

  it('hands back the error', async () => {
    const error = new Error('gone');
    vi.spyOn(supabase.auth.passkey, 'delete').mockResolvedValue({
      data: null,
      error,
    } as never);

    await expect(deletePasskey('passkey-1')).resolves.toEqual({ error });
  });
});

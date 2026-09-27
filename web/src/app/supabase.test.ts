import { afterEach, describe, expect, it, vi } from 'vitest';

describe('supabase client bootstrap', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('throws a descriptive error when the URL env var is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    await expect(import('./supabase')).rejects.toThrow(
      'Missing NEXT_PUBLIC_SUPABASE_URL',
    );
  });

  it('throws a descriptive error when the anon key env var is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    await expect(import('./supabase')).rejects.toThrow(
      'Missing NEXT_PUBLIC_SUPABASE_ANON_KEY',
    );
  });
});

describe('the stored session', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  // supabase-js's default is sb-<first host label>-auth-token; any other key would sign every visitor out on deploy.
  it("is kept under supabase-js's own default key", async () => {
    const { AUTH_STORAGE_KEY } = await import('./supabase');

    expect(AUTH_STORAGE_KEY).toBe('sb-example-auth-token');
  });

  it('is removed from storage on request', async () => {
    const { forgetStoredSession } = await import('./supabase');
    const removeItem = vi.fn();
    vi.stubGlobal('window', { localStorage: { removeItem } });

    forgetStoredSession();

    expect(removeItem).toHaveBeenCalledExactlyOnceWith('sb-example-auth-token');
  });

  it('is left to memory, without an error, when storage refuses access', async () => {
    const { forgetStoredSession } = await import('./supabase');
    vi.stubGlobal('window', {
      get localStorage() {
        throw new DOMException('blocked', 'SecurityError');
      },
    });

    expect(() => forgetStoredSession()).not.toThrow();
  });
});

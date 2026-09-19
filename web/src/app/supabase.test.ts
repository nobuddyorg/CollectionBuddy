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

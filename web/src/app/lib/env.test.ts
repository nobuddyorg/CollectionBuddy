import { afterEach, describe, expect, it, vi } from 'vitest';

import { basePath, requireEnv, withBasePath } from './env';

describe('requireEnv', () => {
  it('hands back a value that is set', () => {
    expect(requireEnv('NEXT_PUBLIC_EXAMPLE', 'configured')).toBe('configured');
  });

  it('names the missing variable and where to set it', () => {
    expect(() => requireEnv('NEXT_PUBLIC_EXAMPLE', undefined)).toThrow(
      'Missing NEXT_PUBLIC_EXAMPLE -- copy web/.env.example to web/.env.local and fill it in',
    );
  });

  it('treats an empty value as missing', () => {
    expect(() => requireEnv('NEXT_PUBLIC_EXAMPLE', '')).toThrow(
      'Missing NEXT_PUBLIC_EXAMPLE',
    );
  });
});

describe('the base path', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is empty when the app is served from the root', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', undefined);

    expect(basePath()).toBe('');
    expect(withBasePath('/sw.js')).toBe('/sw.js');
  });

  it('prefixes a path when the app is served from a subdirectory', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/repo');

    expect(basePath()).toBe('/repo');
    expect(withBasePath('/sw.js')).toBe('/repo/sw.js');
    expect(withBasePath('/')).toBe('/repo/');
  });
});

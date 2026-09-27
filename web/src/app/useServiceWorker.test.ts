// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useServiceWorker } from './useServiceWorker';

describe('useServiceWorker', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('registers under the base path, with a matching scope', () => {
    const register = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { serviceWorker: { register } });
    renderHook(() => useServiceWorker());
    // NEXT_PUBLIC_BASE_PATH and NEXT_PUBLIC_BUILD_ID are unset outside a build; a build inlines literals.
    expect(register).toHaveBeenCalledWith('/sw.js?build=', { scope: '/' });
  });

  // A new script URL per build is what installs a new worker, and with it a new cache.
  it('names the build in the script URL', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/CollectionBuddy');
    vi.stubEnv('NEXT_PUBLIC_BUILD_ID', 'build-42');
    const register = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { serviceWorker: { register } });
    renderHook(() => useServiceWorker());
    expect(register).toHaveBeenCalledWith(
      '/CollectionBuddy/sw.js?build=build-42',
      { scope: '/CollectionBuddy/' },
    );
  });

  it('registers once, however often the page re-renders', () => {
    const register = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { serviceWorker: { register } });
    const { rerender } = renderHook(() => useServiceWorker());

    rerender();
    rerender();

    expect(register).toHaveBeenCalledOnce();
  });

  it('does nothing when the browser has no serviceWorker support', () => {
    vi.stubGlobal('navigator', {});
    expect(() => renderHook(() => useServiceWorker())).not.toThrow();
  });

  it('reports a failed registration rather than swallowing it', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const failure = new Error('registration failed');
    const register = vi.fn().mockRejectedValue(failure);
    vi.stubGlobal('navigator', { serviceWorker: { register } });
    renderHook(() => useServiceWorker());
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalled());
    expect(consoleError).toHaveBeenCalledWith(
      'Service worker registration failed:',
      failure,
    );
    consoleError.mockRestore();
  });
});

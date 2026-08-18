// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useServiceWorker } from './useServiceWorker';

describe('useServiceWorker', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registers under the base path, with a matching scope', () => {
    const register = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { serviceWorker: { register } });
    renderHook(() => useServiceWorker());
    // NEXT_PUBLIC_BASE_PATH is unset outside a production build (see
    // next.config.ts); the production value is just a literal prefix on both.
    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
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

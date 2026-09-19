// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { THEME_MEDIA_QUERY, THEME_STORAGE_KEY, useTheme } from './useTheme';

function Probe() {
  const { preference, resolved } = useTheme();
  return <div data-preference={preference} data-resolved={resolved} />;
}

function mockMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<(e: { matches: boolean }) => void>();
  const addEventListener = vi.fn(
    (event: string, cb: (e: { matches: boolean }) => void) => {
      if (event === 'change') listeners.add(cb);
    },
  );
  const removeEventListener = vi.fn(
    (event: string, cb: (e: { matches: boolean }) => void) => {
      if (event === 'change') listeners.delete(cb);
    },
  );
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      get matches() {
        return matches;
      },
      media: THEME_MEDIA_QUERY,
      addEventListener,
      removeEventListener,
    }),
  );
  return {
    setMatches(next: boolean) {
      matches = next;
      listeners.forEach((cb) => cb({ matches: next }));
    },
    listenerCount: () => listeners.size,
  };
}

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // useSyncExternalStore's third argument only ever runs during an actual
  // server render (renderToString) or hydration -- never during a normal
  // client re-render, which is all a mounted renderHook instance can
  // exercise. Rendering to a string is the only way to reach it for real.
  it("renders the server's answer before any client store has a say", () => {
    const html = renderToString(<Probe />);
    expect(html).toContain('data-preference="system"');
    expect(html).toContain('data-resolved="light"');
  });

  it('starts from whatever is already stored', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    mockMatchMedia(false);
    const { result } = renderHook(() => useTheme());

    expect(result.current.preference).toBe('dark');
    expect(result.current.resolved).toBe('dark');
  });

  it('follows the OS when nothing is stored', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useTheme());

    expect(result.current.preference).toBe('system');
    expect(result.current.resolved).toBe('dark');
  });

  it('writes the resolved theme onto the document element', () => {
    mockMatchMedia(true);
    renderHook(() => useTheme());

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('persists an explicit choice and reflects it back immediately', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setThemePreference('dark');
    });

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(result.current.preference).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('clears the stored value when switching back to system', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    mockMatchMedia(false);
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setThemePreference('system');
    });

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(result.current.preference).toBe('system');
  });

  it('picks up a preference change made from another tab', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useTheme());
    expect(result.current.preference).toBe('system');

    act(() => {
      localStorage.setItem(THEME_STORAGE_KEY, 'dark');
      window.dispatchEvent(new Event('storage'));
    });

    expect(result.current.preference).toBe('dark');
  });

  it('reacts to the OS switching color scheme', () => {
    const media = mockMatchMedia(false);
    const { result } = renderHook(() => useTheme());
    expect(result.current.resolved).toBe('light');

    act(() => {
      media.setMatches(true);
    });

    expect(result.current.resolved).toBe('dark');
  });

  it('stops listening for either kind of change once unmounted', () => {
    const media = mockMatchMedia(false);
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useTheme());
    expect(media.listenerCount()).toBe(1);

    unmount();

    expect(media.listenerCount()).toBe(0);
    // Every addEventListener this hook made on window has a matching
    // removeEventListener once it's gone.
    for (const [event, cb] of addSpy.mock.calls) {
      expect(removeSpy).toHaveBeenCalledWith(event, cb);
    }
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});

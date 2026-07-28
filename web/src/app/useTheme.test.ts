// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTheme } from './useTheme';

function mockMatchMedia(matches: boolean) {
  const listeners = new Set<() => void>();
  const mql = {
    matches,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_: string, listener: () => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) =>
      listeners.delete(listener),
  };
  window.matchMedia = vi.fn().mockReturnValue(mql);
  return {
    setMatches: (next: boolean) => {
      mql.matches = next;
    },
    fire: () => listeners.forEach((listener) => listener()),
  };
}

describe('useTheme', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to the system preference and resolves it from matchMedia', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useTheme());
    expect(result.current.preference).toBe('system');
    expect(result.current.resolved).toBe('dark');
  });

  it('reads a previously stored preference over the system default', () => {
    mockMatchMedia(false);
    window.localStorage.setItem('theme', 'dark');
    const { result } = renderHook(() => useTheme());
    expect(result.current.preference).toBe('dark');
    expect(result.current.resolved).toBe('dark');
  });

  it('persists an explicit preference and reflects it on <html data-theme>', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setThemePreference('dark'));
    expect(result.current.resolved).toBe('dark');
    expect(window.localStorage.getItem('theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('clears the stored preference when switching back to system', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setThemePreference('light'));
    act(() => result.current.setThemePreference('system'));
    expect(window.localStorage.getItem('theme')).toBeNull();
    expect(result.current.resolved).toBe('dark');
  });

  it('reacts to OS-level scheme changes while on system preference', () => {
    const { setMatches, fire } = mockMatchMedia(false);
    const { result } = renderHook(() => useTheme());
    expect(result.current.resolved).toBe('light');

    act(() => {
      setMatches(true);
      fire();
    });
    expect(result.current.resolved).toBe('dark');
  });
});

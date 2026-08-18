'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'theme';
export const THEME_MEDIA_QUERY = '(prefers-color-scheme: dark)';
export const THEME_PREFERENCES: readonly ThemePreference[] = [
  'system',
  'light',
  'dark',
];

/**
 * Anything that isn't 'light' or 'dark' lands on 'system', including the
 * literal string 'system' -- setThemePreference never writes it, removing
 * the key instead, so a visitor who never touched the control and one who
 * went back to system are indistinguishable.
 */
export function normalizePreference(stored: string | null): ThemePreference {
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

/** The three the visitor chooses between, resolved to the two that exist. */
export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}

/* v8 ignore start -- store plumbing and the hook; only
 * normalizePreference/resolveTheme above are gated and mutation-tested. */
// Stryker disable all

// localStorage fires `storage` in *other* tabs, never in the one that did
// the writing, so a same-tab change needs its own announcement.
const THEME_CHANGE_EVENT = 'collectionbuddy:theme';

function subscribePreference(onChange: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

function readPreference(): ThemePreference {
  return normalizePreference(localStorage.getItem(THEME_STORAGE_KEY));
}

function subscribeSystem(onChange: () => void) {
  const media = window.matchMedia(THEME_MEDIA_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function readSystemPrefersDark(): boolean {
  return window.matchMedia(THEME_MEDIA_QUERY).matches;
}

// The answer lives in localStorage and in the OS, not in React, so it is
// read as an external store rather than copied into state on mount -- two
// mounted copies of the control can then never disagree.
//
// The server snapshots feed the prerendered HTML only; the inline script in
// layout.tsx has already put the real answer on <html> before first paint.
export function useTheme() {
  const preference = useSyncExternalStore(
    subscribePreference,
    readPreference,
    // useSyncExternalStore infers its return type from all three callbacks
    // together -- drop this assertion and the type widens to `string`.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    () => 'system' as ThemePreference,
  );
  const systemPrefersDark = useSyncExternalStore(
    subscribeSystem,
    readSystemPrefersDark,
    () => false,
  );

  const resolved = resolveTheme(preference, systemPrefersDark);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolved);
  }, [resolved]);

  const setThemePreference = useCallback((next: ThemePreference) => {
    if (next === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, next);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }, []);

  return { preference, resolved, setThemePreference };
}
// Stryker restore all
/* v8 ignore stop */

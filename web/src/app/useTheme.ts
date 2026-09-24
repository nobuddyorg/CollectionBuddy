'use client';

import { useEffect, useSyncExternalStore } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'theme';
export const THEME_MEDIA_QUERY = '(prefers-color-scheme: dark)';
export const THEME_PREFERENCES: readonly ThemePreference[] = [
  'system',
  'light',
  'dark',
];

/** 'system' is never stored (setThemePreference removes the key), so it and no choice are the same. */
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

// localStorage fires `storage` only in other tabs, so a same-tab change needs its own event.
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

// Read as an external store, not copied into state, so two mounted controls can never disagree.
export function useTheme() {
  const preference = useSyncExternalStore<ThemePreference>(
    subscribePreference,
    readPreference,
    () => 'system',
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

  const setThemePreference = (next: ThemePreference) => {
    if (next === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, next);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  };

  return { preference, resolved, setThemePreference };
}

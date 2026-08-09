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
 * What a stored value means. Anything that isn't one of the two explicit
 * choices means "no choice on record" and lands on system -- including the
 * string 'system' itself, which is never written (see setThemePreference:
 * choosing system removes the key rather than storing a third value, so
 * that a visitor who has never touched the control and one who has
 * deliberately gone back to system are the same visitor).
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

/* v8 ignore start -- store plumbing and the hook (localStorage, matchMedia,
 * the DOM attribute); normalizePreference/resolveTheme above are what's
 * gated and mutation-tested. */
// Stryker disable all: this half isn't covered by tests, only
// normalizePreference/resolveTheme above are -- mutants in here would only
// be noise.

// localStorage fires `storage` in *other* tabs, never in the one that did
// the writing, so a same-tab change needs its own announcement. Without it
// the control would be updating a value nothing is listening to.
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
  // While the preference is `system`, the OS switching over at sunset has to
  // carry the page with it -- that is the whole meaning of the option.
  const media = window.matchMedia(THEME_MEDIA_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function readSystemPrefersDark(): boolean {
  return window.matchMedia(THEME_MEDIA_QUERY).matches;
}

// The answer lives in localStorage and in the OS, not in React -- so it is
// read as an external store rather than copied into state on mount. That
// also means two mounted copies of the control can never disagree, and a
// change made in another tab arrives on its own.
//
// The server snapshots are what the prerendered HTML is built from. They are
// not what the visitor sees first: the inline script in layout.tsx has
// already put the real answer on <html> before anything paints.
export function useTheme() {
  const preference = useSyncExternalStore(
    subscribePreference,
    readPreference,
    // Looks redundant in isolation, but useSyncExternalStore infers its
    // return type from all three callbacks together -- drop this and the
    // inferred type widens to plain `string`, which then fails to satisfy
    // ThemePreference everywhere `preference` is used below.
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

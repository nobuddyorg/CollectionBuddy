'use client';

import { useCallback, useEffect, useState } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'theme';
const MEDIA_QUERY = '(prefers-color-scheme: dark)';

function readStoredPreference(): ThemePreference {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia(MEDIA_QUERY).matches ? 'dark' : 'light';
}

// Mirrors the inline script in layout.tsx that sets data-theme before
// hydration to avoid a flash -- this just keeps state/DOM in sync after
// that point, and reacts to OS-level changes while on 'system'.
export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>('system');
  const [system, setSystem] = useState<ResolvedTheme>('light');

  useEffect(() => {
    setPreference(readStoredPreference());
    setSystem(systemTheme());

    const mql = window.matchMedia(MEDIA_QUERY);
    const onChange = () => setSystem(mql.matches ? 'dark' : 'light');
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const resolved: ResolvedTheme = preference === 'system' ? system : preference;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolved);
  }, [resolved]);

  const setThemePreference = useCallback((next: ThemePreference) => {
    setPreference(next);
    if (next === 'system') {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  }, []);

  return { preference, resolved, setThemePreference };
}

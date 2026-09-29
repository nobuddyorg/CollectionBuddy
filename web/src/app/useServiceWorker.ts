'use client';

import { useEffect } from 'react';

import { withBasePath } from './lib/env';

export function useServiceWorker(): void {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // Read as a literal `process.env.NEXT_PUBLIC_X` expression, the only form Next's static export inlines.
    const build = process.env.NEXT_PUBLIC_BUILD_ID ?? '';
    // A new script URL per build installs a new worker, whose activation deletes the old build's cache.
    navigator.serviceWorker
      .register(withBasePath(`/sw.js?build=${build}`), {
        scope: withBasePath('/'),
      })
      .catch((error: unknown) => {
        console.error('Service worker registration failed:', error);
      });
  }, []);
}

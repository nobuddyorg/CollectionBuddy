'use client';

import { useEffect } from 'react';

export function useServiceWorker(): void {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // Read as literal `process.env.NEXT_PUBLIC_X` expressions, the only form Next's static export inlines.
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
    const build = process.env.NEXT_PUBLIC_BUILD_ID ?? '';
    // A new script URL per build installs a new worker, whose activation deletes the old build's cache.
    navigator.serviceWorker
      .register(`${basePath}/sw.js?build=${build}`, {
        scope: `${basePath}/`,
      })
      .catch((error: unknown) => {
        console.error('Service worker registration failed:', error);
      });
  }, []);
}

'use client';

import { useEffect } from 'react';

export function useServiceWorker(): void {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // Read as a literal `process.env.NEXT_PUBLIC_X` expression, the only form Next's static export inlines.
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
    navigator.serviceWorker
      .register(`${basePath}/sw.js`, { scope: `${basePath}/` })
      .catch((error: unknown) => {
        console.error('Service worker registration failed:', error);
      });
  }, []);
}

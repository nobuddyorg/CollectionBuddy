'use client';

import { useEffect } from 'react';

/**
 * `NEXT_PUBLIC_BASE_PATH` must be read as this exact literal expression
 * (matching layout.tsx, supabase.ts): Next's static-export inliner only
 * replaces it when read this way, not from a variable built from it.
 */
export function useServiceWorker(): void {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
    navigator.serviceWorker
      .register(`${basePath}/sw.js`, { scope: `${basePath}/` })
      .catch((err: unknown) => {
        console.error('Service worker registration failed:', err);
      });
  }, []);
}

'use client';

import { useEffect } from 'react';

/**
 * Registers `public/sw.js` once, after mount rather than from an inline
 * script the way the theme/framebusting scripts are (#333): nothing here
 * has to run before the first paint, and a `serviceWorker.register` call
 * is not something a static `<script>` tag can express well.
 *
 * The literal `process.env.NEXT_PUBLIC_BASE_PATH` matches every other
 * reader of it (layout.tsx, supabase.ts): Next's static-export inliner
 * only replaces this env var when it is read as this exact expression, not
 * a variable built from it.
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

'use client';

import { useServiceWorker } from './useServiceWorker';

/** Renders nothing; registers the service worker on mount (#333). */
export function ServiceWorkerRegistration() {
  useServiceWorker();
  return null;
}

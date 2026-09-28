'use client';

import { useServiceWorker } from './useServiceWorker';

export function ServiceWorkerRegistration() {
  useServiceWorker();
  return null;
}

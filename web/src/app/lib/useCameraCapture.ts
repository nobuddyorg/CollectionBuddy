'use client';

import { useSyncExternalStore } from 'react';

const COARSE_POINTER = '(pointer: coarse)';

function subscribe(onChange: () => void) {
  const query = window.matchMedia(COARSE_POINTER);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

const readCoarsePointer = () => window.matchMedia(COARSE_POINTER).matches;

/** `capture` opens a camera only on a touch device; elsewhere it is ignored, so the option is not offered there. */
export function useCameraCapture(): boolean {
  return useSyncExternalStore(subscribe, readCoarsePointer, () => false);
}

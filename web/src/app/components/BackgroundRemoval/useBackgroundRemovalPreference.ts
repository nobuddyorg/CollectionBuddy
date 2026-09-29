'use client';

import { useSyncExternalStore } from 'react';

// Belongs to the device, like the theme: it stays when another account signs in.
export const BACKGROUND_REMOVAL_STORAGE_KEY = 'removeBackground';

// localStorage fires `storage` only in other tabs, so a same-tab change needs its own event.
const CHANGE_EVENT = 'collectionbuddy:background-removal';

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** Off unless this browser opted in; storage that throws (private mode) keeps it off. */
export function readBackgroundRemovalEnabled(): boolean {
  try {
    return localStorage.getItem(BACKGROUND_REMOVAL_STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

function setCutoutEnabled(enabled: boolean): void {
  if (enabled) localStorage.setItem(BACKGROUND_REMOVAL_STORAGE_KEY, 'on');
  else localStorage.removeItem(BACKGROUND_REMOVAL_STORAGE_KEY);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Whether photos are offered without their background before they upload; off by default. */
export function useBackgroundRemovalPreference() {
  const enabled = useSyncExternalStore(
    subscribe,
    readBackgroundRemovalEnabled,
    () => false,
  );
  return { enabled, setEnabled: setCutoutEnabled };
}

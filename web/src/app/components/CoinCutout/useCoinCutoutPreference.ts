'use client';

import { useSyncExternalStore } from 'react';

// Belongs to the device, like the theme: it stays when another account signs in.
export const COIN_CUTOUT_STORAGE_KEY = 'coinCutout';

// localStorage fires `storage` only in other tabs, so a same-tab change needs its own event.
const CHANGE_EVENT = 'collectionbuddy:coin-cutout';

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** Off unless this browser opted in; storage that throws (private mode) keeps it off. */
export function readCoinCutoutEnabled(): boolean {
  try {
    return localStorage.getItem(COIN_CUTOUT_STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

function setCoinCutoutEnabled(enabled: boolean): void {
  if (enabled) localStorage.setItem(COIN_CUTOUT_STORAGE_KEY, 'on');
  else localStorage.removeItem(COIN_CUTOUT_STORAGE_KEY);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Whether photos are offered for a coin cut-out before they upload; off by default. */
export function useCoinCutoutPreference() {
  const enabled = useSyncExternalStore(
    subscribe,
    readCoinCutoutEnabled,
    () => false,
  );
  return { enabled, setEnabled: setCoinCutoutEnabled };
}

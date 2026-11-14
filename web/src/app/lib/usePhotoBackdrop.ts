'use client';

import { useSyncExternalStore } from 'react';

import {
  readStoredValue,
  removeStoredValue,
  writeStoredValue,
} from './browserStorage';

/** What shows through a photo's see-through parts: the theme's own colour, or black or white in both themes. */
export type PhotoBackdrop = 'theme' | 'black' | 'white';

// Belongs to the device, like the theme: it stays when another account signs in.
export const PHOTO_BACKDROP_STORAGE_KEY = 'photoBackdrop';
export const PHOTO_BACKDROPS: readonly PhotoBackdrop[] = [
  'theme',
  'black',
  'white',
];

// localStorage fires `storage` only in other tabs, so a same-tab change needs its own event.
const CHANGE_EVENT = 'collectionbuddy:photo-backdrop';

/** 'theme' is never stored (choosing it removes the key), so it and no choice, or a value that is none, are the same. */
export function normalizePhotoBackdrop(stored: string | null): PhotoBackdrop {
  return stored === 'black' || stored === 'white' ? stored : 'theme';
}

/** The class that lays the chosen colour behind a photo; none for the theme, whose own surface shows through. */
export function photoBackdropClass(backdrop: PhotoBackdrop): string {
  if (backdrop === 'black') return 'bg-black';
  if (backdrop === 'white') return 'bg-white';
  return '';
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

function readPhotoBackdrop(): PhotoBackdrop {
  return normalizePhotoBackdrop(readStoredValue(PHOTO_BACKDROP_STORAGE_KEY));
}

function setPhotoBackdrop(backdrop: PhotoBackdrop): void {
  if (backdrop === 'theme') removeStoredValue(PHOTO_BACKDROP_STORAGE_KEY);
  else writeStoredValue(PHOTO_BACKDROP_STORAGE_KEY, backdrop);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** The backdrop this browser chose for photos, the theme's by default. */
export function usePhotoBackdrop() {
  const backdrop = useSyncExternalStore(
    subscribe,
    readPhotoBackdrop,
    () => 'theme' as const,
  );
  return { backdrop, setPhotoBackdrop };
}

'use client';

import { useSyncExternalStore } from 'react';

import {
  readStoredValue,
  removeStoredValue,
  writeStoredValue,
} from '../../lib/browserStorage';
import { DEFAULT_PAGE_SIZE, normalizePageSize, type PageSize } from './paging';

// Belongs to the device, like the theme: it stays when another account signs in.
export const PAGE_SIZE_STORAGE_KEY = 'pageSize';

// localStorage fires `storage` only in other tabs, so a same-tab change needs its own event.
const CHANGE_EVENT = 'collectionbuddy:page-size';

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** The entries a page shows on this device, the default unless another size was chosen. */
export function readPageSize(): PageSize {
  return normalizePageSize(readStoredValue(PAGE_SIZE_STORAGE_KEY));
}

function setPageSize(size: PageSize): void {
  if (size === DEFAULT_PAGE_SIZE) removeStoredValue(PAGE_SIZE_STORAGE_KEY);
  else writeStoredValue(PAGE_SIZE_STORAGE_KEY, String(size));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** The entries a page shows on this device, and the way to choose another size. */
export function usePageSize() {
  const pageSize = useSyncExternalStore(
    subscribe,
    readPageSize,
    () => DEFAULT_PAGE_SIZE,
  );
  return { pageSize, setPageSize };
}

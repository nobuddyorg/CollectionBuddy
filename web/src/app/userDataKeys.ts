import { readStoredValue } from './lib/browserStorage';

// The map's looked-up places, written by earlier versions only: a place is now located when it is saved.
export const RETIRED_GEOCODE_CACHE_KEY = 'cb_geocode_cache_v1';

export const STORAGE_OWNER_KEY = 'collectionbuddy.storageOwner';

/** The account this browser's per-user keys belong to, or null once forgotten. */
export function storageOwner(): string | null {
  return readStoredValue(STORAGE_OWNER_KEY);
}

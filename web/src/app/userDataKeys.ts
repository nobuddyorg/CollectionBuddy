import { readStoredValue } from './lib/browserStorage';

// A leaf, so the lazily loaded map reads these without pulling in the caches forgetting an account clears.
export const GEOCODE_CACHE_KEY = 'cb_geocode_cache_v1';

export const STORAGE_OWNER_KEY = 'collectionbuddy.storageOwner';

/** The account this browser's per-user keys belong to, or null once forgotten. */
export function storageOwner(): string | null {
  return readStoredValue(STORAGE_OWNER_KEY);
}

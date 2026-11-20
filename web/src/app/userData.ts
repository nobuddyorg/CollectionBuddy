import { SELECTED_CATEGORY_KEY } from './components/CategorySelect/selection';
import { forgetPrefetchedFirstPage } from './components/ItemList/firstPagePrefetch';
import { clearImageCache } from './components/ItemList/imageCache';
import { removeStoredValue, writeStoredValue } from './lib/browserStorage';
import {
  RETIRED_GEOCODE_CACHE_KEY,
  STORAGE_OWNER_KEY,
  storageOwner,
} from './userDataKeys';

// Dropped on every claim as well, so a browser that never signs out still loses them.
const RETIRED_KEYS = [RETIRED_GEOCODE_CACHE_KEY] as const;

// Every key one account writes; theme and language belong to the device and stay.
const PER_USER_KEYS = [
  SELECTED_CATEGORY_KEY,
  STORAGE_OWNER_KEY,
  ...RETIRED_KEYS,
] as const;

/** Drops what the last account left in this tab and browser: its places, its collection, its photos and their links. */
export function forgetUserData(): void {
  clearImageCache();
  forgetPrefetchedFirstPage();
  for (const key of PER_USER_KEYS) removeStoredValue(key);
}

/** Forgets another account's data before `userId` reads any of it, then marks what follows as its own. */
export function claimUserData(userId: string): void {
  for (const key of RETIRED_KEYS) removeStoredValue(key);
  if (storageOwner() === userId) return;
  forgetUserData();
  writeStoredValue(STORAGE_OWNER_KEY, userId);
}

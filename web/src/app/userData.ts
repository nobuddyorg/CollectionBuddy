import { SELECTED_CATEGORY_KEY } from './components/CategorySelect/selection';
import { forgetPrefetchedFirstPage } from './components/ItemList/firstPagePrefetch';
import { clearImageCache } from './components/ItemList/imageCache';
import {
  GEOCODE_CACHE_KEY,
  STORAGE_OWNER_KEY,
  storageOwner,
} from './userDataKeys';

// Every key one account writes; theme and language belong to the device and stay.
const PER_USER_KEYS = [
  SELECTED_CATEGORY_KEY,
  GEOCODE_CACHE_KEY,
  STORAGE_OWNER_KEY,
] as const;

/** Drops what the last account left in this tab and browser: its places, its collection, its photos and their links. */
export function forgetUserData(): void {
  clearImageCache();
  forgetPrefetchedFirstPage();
  try {
    for (const key of PER_USER_KEYS) window.localStorage.removeItem(key);
  } catch {
    // Storage that refuses access (Safari private mode) kept nothing to forget.
  }
}

/** Forgets another account's data before `userId` reads any of it, then marks what follows as its own. */
export function claimUserData(userId: string): void {
  try {
    if (storageOwner() === userId) return;
    forgetUserData();
    window.localStorage.setItem(STORAGE_OWNER_KEY, userId);
  } catch {
    // Storage that refuses access (Safari private mode) holds no other account's data.
  }
}

// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SELECTED_CATEGORY_KEY } from './components/CategorySelect/selection';
import {
  prefetchFirstPage,
  takePrefetchedFirstPage,
} from './components/ItemList/firstPagePrefetch';
import {
  cacheSignedUrls,
  lastSignedUrl,
} from './components/ItemList/imageCache';
import { claimUserData, forgetUserData } from './userData';
import {
  GEOCODE_CACHE_KEY,
  STORAGE_OWNER_KEY as OWNER_KEY,
  storageOwner,
} from './userDataKeys';
import type { listItems } from './data/itemPage';

function leaveBehind() {
  window.localStorage.setItem(SELECTED_CATEGORY_KEY, 'category-a');
  window.localStorage.setItem(
    GEOCODE_CACHE_KEY,
    JSON.stringify({ 'Omas Haus': { name: 'Omas Haus', lat: 1, lng: 2 } }),
  );
  window.localStorage.setItem('theme', 'dark');
  window.localStorage.setItem('lang', 'en');
  cacheSignedUrls([['user-a/item/full.jpg', 'https://signed/a']]);
}

function prefetchTheirFirstPage() {
  const read = vi.fn(() => new Promise(() => {}));
  prefetchFirstPage('category-a', read as unknown as typeof listItems);
}

function storedKeys(): string[] {
  return Object.keys(window.localStorage).sort();
}

describe('forgetUserData', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("drops the account's places, collection, photos and their links, and keeps the device's theme and language", () => {
    leaveBehind();
    prefetchTheirFirstPage();
    window.localStorage.setItem(OWNER_KEY, 'user-a');

    forgetUserData();

    expect(storedKeys()).toEqual(['lang', 'theme']);
    expect(lastSignedUrl('user-a/item/full.jpg')).toBeUndefined();
    expect(takePrefetchedFirstPage('category-a')).toBeNull();
    expect(storageOwner()).toBeNull();
  });

  it('still drops the photo links when storage refuses access', () => {
    cacheSignedUrls([['user-a/item/full.jpg', 'https://signed/a']]);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('denied');
    });

    expect(() => forgetUserData()).not.toThrow();
    expect(lastSignedUrl('user-a/item/full.jpg')).toBeUndefined();
  });
});

describe('claimUserData', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("clears another account's data before the new one reads it", () => {
    leaveBehind();
    window.localStorage.setItem(OWNER_KEY, 'user-a');

    claimUserData('user-b');

    expect(storedKeys()).toEqual([OWNER_KEY, 'lang', 'theme']);
    expect(window.localStorage.getItem(OWNER_KEY)).toBe('user-b');
    expect(lastSignedUrl('user-a/item/full.jpg')).toBeUndefined();
  });

  it('treats data nobody has claimed yet as another account’s', () => {
    leaveBehind();

    claimUserData('user-b');

    expect(window.localStorage.getItem(SELECTED_CATEGORY_KEY)).toBeNull();
    expect(window.localStorage.getItem(OWNER_KEY)).toBe('user-b');
  });

  it('keeps the same account’s own data', () => {
    leaveBehind();
    window.localStorage.setItem(OWNER_KEY, 'user-a');

    claimUserData('user-a');

    expect(window.localStorage.getItem(SELECTED_CATEGORY_KEY)).toBe(
      'category-a',
    );
    expect(window.localStorage.getItem(GEOCODE_CACHE_KEY)).not.toBeNull();
    expect(lastSignedUrl('user-a/item/full.jpg')).toBe('https://signed/a');
  });

  it('survives storage that refuses access', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });

    expect(() => claimUserData('user-b')).not.toThrow();
  });
});

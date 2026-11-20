// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  RETIRED_GEOCODE_CACHE_KEY,
  STORAGE_OWNER_KEY,
  storageOwner,
} from './userDataKeys';

describe('the per-user keys', () => {
  it('name the retired geocode cache by the key earlier versions wrote it under', () => {
    expect(RETIRED_GEOCODE_CACHE_KEY).toBe('cb_geocode_cache_v1');
  });
});

describe('storageOwner', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('names the account the stored keys belong to', () => {
    window.localStorage.setItem(STORAGE_OWNER_KEY, 'user-a');

    expect(storageOwner()).toBe('user-a');
  });

  it('names no one once forgotten', () => {
    expect(storageOwner()).toBeNull();
  });

  it('names no one when storage refuses access', () => {
    window.localStorage.setItem(STORAGE_OWNER_KEY, 'user-a');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });

    expect(storageOwner()).toBeNull();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  classifyLocationError,
  isGeolocationGranted,
} from './useCurrentLocation';

describe('classifyLocationError', () => {
  it('reports a refusal as denied', () => {
    expect(classifyLocationError({ code: 1 })).toBe('denied');
  });

  it('reports a missing position as unavailable', () => {
    expect(classifyLocationError({ code: 2 })).toBe('unavailable');
  });

  it('reports a timeout as unavailable', () => {
    expect(classifyLocationError({ code: 3 })).toBe('unavailable');
  });

  it('treats an error without a code as unavailable', () => {
    expect(classifyLocationError({})).toBe('unavailable');
  });
});

describe('isGeolocationGranted', () => {
  const originalPermissions = Object.getOwnPropertyDescriptor(
    globalThis.navigator ?? {},
    'permissions',
  );

  function stubPermissions(query: () => Promise<{ state: string }>) {
    vi.stubGlobal('navigator', { permissions: { query } });
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalPermissions && globalThis.navigator) {
      Object.defineProperty(
        globalThis.navigator,
        'permissions',
        originalPermissions,
      );
    }
  });

  it('is true only when the permission is already granted', async () => {
    stubPermissions(async () => ({ state: 'granted' }));
    await expect(isGeolocationGranted()).resolves.toBe(true);
  });

  it('is false while the permission is still unanswered', async () => {
    stubPermissions(async () => ({ state: 'prompt' }));
    await expect(isGeolocationGranted()).resolves.toBe(false);
  });

  it('is false once the permission is denied', async () => {
    stubPermissions(async () => ({ state: 'denied' }));
    await expect(isGeolocationGranted()).resolves.toBe(false);
  });

  // Older Safari has no Permissions API (and rejects the geolocation name
  // where it does): asking outright is the only thing left to do.
  it('falls back to asking when the permission cannot be read', async () => {
    stubPermissions(async () => {
      throw new TypeError('unsupported');
    });
    await expect(isGeolocationGranted()).resolves.toBe(true);
  });

  it('falls back to asking when there is no Permissions API', async () => {
    vi.stubGlobal('navigator', {});
    await expect(isGeolocationGranted()).resolves.toBe(true);
  });
});

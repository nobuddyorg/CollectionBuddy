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

  // The callback is documented to hand over an error object, so this is
  // defensive rather than expected -- but the defence is only worth keeping
  // if it works, and "unavailable" is the answer that leads somewhere.
  it('survives being handed nothing at all', () => {
    const nothing = undefined as unknown as { code?: number };
    expect(classifyLocationError(nothing)).toBe('unavailable');
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

  // The permission name is the whole question. Asked about anything else, the
  // browser either throws -- and the fallback then reports "granted" for a
  // permission never checked -- or answers about the wrong capability.
  it('asks about geolocation and nothing else', async () => {
    const query = vi.fn(async () => ({ state: 'granted' }));
    stubPermissions(query);
    await isGeolocationGranted();
    expect(query).toHaveBeenCalledWith({ name: 'geolocation' });
  });
});

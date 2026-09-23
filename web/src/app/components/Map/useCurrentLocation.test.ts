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

  // Defensive rather than expected, but a defence is only worth keeping if it works.
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

  // Older Safari has no Permissions API, or rejects the geolocation name: asking outright is all that is left.
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

  // Asked about any other name, the browser throws (and the fallback reports "granted") or answers wrongly.
  it('asks about geolocation and nothing else', async () => {
    const query = vi.fn(async () => ({ state: 'granted' }));
    stubPermissions(query);
    await isGeolocationGranted();
    expect(query).toHaveBeenCalledWith({ name: 'geolocation' });
  });
});

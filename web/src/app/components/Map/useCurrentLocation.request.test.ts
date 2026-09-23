// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useCurrentLocation } from './useCurrentLocation';

const POSITION: GeolocationPosition = {
  coords: {
    latitude: 50.94,
    longitude: 6.96,
    accuracy: 10,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
    toJSON() {
      return this;
    },
  },
  timestamp: Date.now(),
  toJSON() {
    return this;
  },
};

function mockGeolocation() {
  const lastFix: {
    success?: PositionCallback;
    error?: PositionErrorCallback;
  } = {};
  const getCurrentPosition = vi.fn(
    (success: PositionCallback, error?: PositionErrorCallback) => {
      lastFix.success = success;
      lastFix.error = error;
    },
  );
  const watchPosition = vi.fn(() => 1);
  const clearWatch = vi.fn();
  return { getCurrentPosition, watchPosition, clearWatch, lastFix };
}

// vi.fn() records every argument a call passed, including the PositionOptions the typed signature omits.
function thirdArgument(
  mocked: { mock: { calls: unknown[][] } },
  callIndex = 0,
) {
  return mocked.mock.calls[callIndex]?.[2] as PositionOptions | undefined;
}

function stubNavigator(
  geolocation: ReturnType<typeof mockGeolocation> | undefined,
) {
  vi.stubGlobal('navigator', {
    geolocation,
    permissions: {
      query: vi.fn(async () => ({ state: 'granted' })),
    },
  });
}

describe('useCurrentLocation request', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports unavailable immediately when there is no geolocation API', async () => {
    stubNavigator(undefined);
    const { result } = renderHook(() => useCurrentLocation(false));

    await expect(result.current.request()).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
    });
    expect(result.current.locating).toBe(false);
  });

  it('reports unavailable immediately when there is no navigator object at all', async () => {
    vi.stubGlobal('navigator', undefined);
    const { result } = renderHook(() => useCurrentLocation(false));

    await expect(result.current.request()).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });

  it('requests a fix with the documented accuracy/timeout/freshness options', async () => {
    const geolocation = mockGeolocation();
    stubNavigator(geolocation);
    const { result } = renderHook(() => useCurrentLocation(false));

    act(() => {
      void result.current.request();
    });

    expect(thirdArgument(geolocation.getCurrentPosition)).toEqual({
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 30000,
    });
  });

  it('is locating while the request is in flight, and reports the fix on success', async () => {
    const geolocation = mockGeolocation();
    stubNavigator(geolocation);
    const { result } = renderHook(() => useCurrentLocation(false));

    let requestPromise!: ReturnType<typeof result.current.request>;
    act(() => {
      requestPromise = result.current.request();
    });
    expect(result.current.locating).toBe(true);

    act(() => {
      geolocation.lastFix.success?.(POSITION);
    });
    await expect(requestPromise).resolves.toEqual({
      ok: true,
      location: { lat: 50.94, lng: 6.96 },
    });
    expect(result.current.locating).toBe(false);
    expect(result.current.location).toEqual({ lat: 50.94, lng: 6.96 });
  });

  it('classifies a refusal and stops locating, without touching location', async () => {
    const geolocation = mockGeolocation();
    stubNavigator(geolocation);
    const { result } = renderHook(() => useCurrentLocation(false));

    let requestPromise!: ReturnType<typeof result.current.request>;
    act(() => {
      requestPromise = result.current.request();
    });

    act(() => {
      geolocation.lastFix.error?.({
        code: 1,
      } as GeolocationPositionError);
    });

    await expect(requestPromise).resolves.toEqual({
      ok: false,
      reason: 'denied',
    });
    expect(result.current.locating).toBe(false);
    expect(result.current.location).toBeNull();
  });
});

// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useCurrentLocation } from './useCurrentLocation';
import {
  POSITION,
  mockGeolocation,
  stubNavigator,
  thirdArgument,
} from './useCurrentLocation.test-support';

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

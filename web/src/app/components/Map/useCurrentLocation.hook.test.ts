// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useCurrentLocation, type Coords } from './useCurrentLocation';

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
  const watches = new Map<
    number,
    { success: PositionCallback; error?: PositionErrorCallback }
  >();
  const lastFix: {
    success?: PositionCallback;
    error?: PositionErrorCallback;
  } = {};
  let nextWatchId = 1;
  const getCurrentPosition = vi.fn(
    (success: PositionCallback, error?: PositionErrorCallback) => {
      lastFix.success = success;
      lastFix.error = error;
    },
  );
  const watchPosition = vi.fn(
    (success: PositionCallback, error?: PositionErrorCallback) => {
      const id = nextWatchId++;
      watches.set(id, { success, error });
      return id;
    },
  );
  const clearWatch = vi.fn((id: number) => {
    watches.delete(id);
  });
  return { getCurrentPosition, watchPosition, clearWatch, watches, lastFix };
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
  permissionState: string | Error = 'granted',
) {
  vi.stubGlobal('navigator', {
    geolocation,
    permissions: {
      query: vi.fn(async () => {
        if (permissionState instanceof Error) throw permissionState;
        return { state: permissionState };
      }),
    },
  });
}

describe('useCurrentLocation mount tracking', () => {
  afterEach(() => {
    // Unmount (which touches the stubbed `navigator`) before the stub is torn down, not after.
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('does nothing while inactive', async () => {
    const geolocation = mockGeolocation();
    stubNavigator(geolocation);
    renderHook(() => useCurrentLocation(false));
    await act(async () => {
      await Promise.resolve();
    });

    expect(geolocation.getCurrentPosition).not.toHaveBeenCalled();
    expect(geolocation.watchPosition).not.toHaveBeenCalled();
  });

  it('tolerates an environment with no geolocation API at all', async () => {
    stubNavigator(undefined);
    expect(() => renderHook(() => useCurrentLocation(true))).not.toThrow();
    await act(async () => {
      await Promise.resolve();
    });
  });

  it('tolerates an environment with no navigator object at all', async () => {
    vi.stubGlobal('navigator', undefined);
    expect(() => renderHook(() => useCurrentLocation(true))).not.toThrow();
    await act(async () => {
      await Promise.resolve();
    });
  });

  it('does not clear a watch that was never started (permission never granted)', async () => {
    const geolocation = mockGeolocation();
    stubNavigator(geolocation, 'prompt');
    const { unmount } = renderHook(() => useCurrentLocation(true));
    await act(async () => {
      await Promise.resolve();
    });

    unmount();

    expect(geolocation.clearWatch).not.toHaveBeenCalled();
  });

  it('requests a fix and a watch with the documented accuracy/timeout/freshness options', async () => {
    const geolocation = mockGeolocation();
    stubNavigator(geolocation);
    renderHook(() => useCurrentLocation(true));
    await act(async () => {
      await Promise.resolve();
    });

    expect(thirdArgument(geolocation.getCurrentPosition)).toEqual({
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0,
    });
    expect(thirdArgument(geolocation.watchPosition)).toEqual({
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0,
    });
  });

  it('does not start tracking when permission has not already been granted', async () => {
    const geolocation = mockGeolocation();
    stubNavigator(geolocation, 'prompt');
    renderHook(() => useCurrentLocation(true));
    await act(async () => {
      await Promise.resolve();
    });

    expect(geolocation.getCurrentPosition).not.toHaveBeenCalled();
    expect(geolocation.watchPosition).not.toHaveBeenCalled();
  });

  it('starts a fix and a watch once permission is already granted', async () => {
    const geolocation = mockGeolocation();
    stubNavigator(geolocation);
    renderHook(() => useCurrentLocation(true));
    await act(async () => {
      await Promise.resolve();
    });

    expect(geolocation.getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(geolocation.watchPosition).toHaveBeenCalledTimes(1);
  });

  it('reports the position the watch delivers', async () => {
    const geolocation = mockGeolocation();
    stubNavigator(geolocation);
    const { result } = renderHook(() => useCurrentLocation(true));
    await act(async () => {
      await Promise.resolve();
    });

    const [watchId] = geolocation.watches.keys();
    act(() => {
      geolocation.watches.get(watchId)!.success(POSITION);
    });

    expect(result.current.location).toEqual<Coords>({
      lat: 50.94,
      lng: 6.96,
    });
  });

  it('reports the position getCurrentPosition delivers too, not only the watch', async () => {
    const geolocation = mockGeolocation();
    stubNavigator(geolocation);
    const { result } = renderHook(() => useCurrentLocation(true));
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      geolocation.lastFix.success?.(POSITION);
    });

    expect(result.current.location).toEqual<Coords>({
      lat: 50.94,
      lng: 6.96,
    });
  });

  it('stops the watch on its own after the fixed watch duration', async () => {
    vi.useFakeTimers();
    const geolocation = mockGeolocation();
    stubNavigator(geolocation);
    renderHook(() => useCurrentLocation(true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const [watchId] = geolocation.watches.keys();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });

    expect(geolocation.clearWatch).toHaveBeenCalledWith(watchId);
  });

  it('stops the watch and the pending timer when it becomes inactive', async () => {
    vi.useFakeTimers();
    const geolocation = mockGeolocation();
    stubNavigator(geolocation);
    const { rerender } = renderHook(
      ({ active }) => useCurrentLocation(active),
      { initialProps: { active: true } },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const [watchId] = geolocation.watches.keys();

    rerender({ active: false });

    expect(geolocation.clearWatch).toHaveBeenCalledWith(watchId);

    // The first mount's watch-duration timer must be gone too: advancing past it must not clear again.
    geolocation.clearWatch.mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(geolocation.clearWatch).not.toHaveBeenCalled();
  });

  it('tolerates a failure from the passive fix or the passive watch, without touching state', async () => {
    const geolocation = mockGeolocation();
    stubNavigator(geolocation);
    const { result } = renderHook(() => useCurrentLocation(true));
    await act(async () => {
      await Promise.resolve();
    });
    const [watchId] = geolocation.watches.keys();

    act(() => {
      geolocation.lastFix.error?.({ code: 2 } as GeolocationPositionError);
      geolocation.watches
        .get(watchId)!
        .error?.({ code: 3 } as GeolocationPositionError);
    });

    expect(result.current.location).toBeNull();
    expect(result.current.locating).toBe(false);
  });

  it('does not start tracking if it has already been deactivated by the time the permission check resolves', async () => {
    const geolocation = mockGeolocation();
    let resolvePermission!: (state: { state: string }) => void;
    vi.stubGlobal('navigator', {
      geolocation,
      permissions: {
        query: vi.fn(
          () =>
            new Promise((resolve) => {
              resolvePermission = resolve;
            }),
        ),
      },
    });
    const { rerender } = renderHook(
      ({ active }) => useCurrentLocation(active),
      {
        initialProps: { active: true },
      },
    );

    rerender({ active: false });
    await act(async () => {
      resolvePermission({ state: 'granted' });
      await Promise.resolve();
    });

    expect(geolocation.getCurrentPosition).not.toHaveBeenCalled();
    expect(geolocation.watchPosition).not.toHaveBeenCalled();
  });

  it('ignores a position that arrives after the hook has already stopped tracking', async () => {
    const geolocation = mockGeolocation();
    stubNavigator(geolocation);
    const { result, unmount } = renderHook(() => useCurrentLocation(true));
    await act(async () => {
      await Promise.resolve();
    });
    const [watchId] = geolocation.watches.keys();
    const lateCallback = geolocation.watches.get(watchId)!.success;

    unmount();

    act(() => {
      lateCallback(POSITION);
    });

    expect(result.current.location).toBeNull();
  });

  // Still mounted throughout, so without the stale callback's own guard the update would be observable.
  it('ignores a position from a watch instance that a dependency change has already superseded', async () => {
    const geolocation = mockGeolocation();
    stubNavigator(geolocation);
    const { result, rerender } = renderHook(
      ({ active }) => useCurrentLocation(active),
      { initialProps: { active: true } },
    );
    await act(async () => {
      await Promise.resolve();
    });
    const [firstWatchId] = geolocation.watches.keys();
    const staleCallback = geolocation.watches.get(firstWatchId)!.success;

    // The only dependency change this hook has tears down the first instance and starts a live one.
    rerender({ active: false });
    rerender({ active: true });
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      staleCallback(POSITION);
    });

    expect(result.current.location).toBeNull();
  });
});

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

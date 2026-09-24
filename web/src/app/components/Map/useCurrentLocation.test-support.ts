import { vi } from 'vitest';

export const POSITION: GeolocationPosition = {
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

export function mockGeolocation() {
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
export function thirdArgument(
  mocked: { mock: { calls: unknown[][] } },
  callIndex = 0,
) {
  return mocked.mock.calls[callIndex]?.[2] as PositionOptions | undefined;
}

export function stubNavigator(
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

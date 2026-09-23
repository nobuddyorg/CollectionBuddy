'use client';
import { useCallback, useEffect, useState } from 'react';

export interface Coords {
  lat: number;
  lng: number;
}

export type LocationFailure = 'denied' | 'unavailable';

export type LocationResult =
  { ok: true; location: Coords } | { ok: false; reason: LocationFailure };

const FIX_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 12000,
  maximumAge: 0,
};

// The "where am I" tap accepts a recent fix: re-arming the GPS to learn the same thing costs seconds.
const REQUEST_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 30000,
};

const WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 20000,
  maximumAge: 0,
};

// How long the first fix keeps refining; the pin stops visibly improving well before this.
const WATCH_MS = 10000;

const coordsOf = (position: GeolocationPosition): Coords => ({
  lat: position.coords.latitude,
  lng: position.coords.longitude,
});

/** "You said no" gets different advice from every other failure, and only it can be undone. */
export function classifyLocationError(error: {
  code?: number;
}): LocationFailure {
  // GeolocationPositionError.PERMISSION_DENIED, spelled out: the constant lives on an instance jsdom lacks.
  return error?.code === 1 ? 'denied' : 'unavailable';
}

/** Reads the permission without prompting: an unprompted dialog gets dismissed, and dismissals add up to a block. */
export async function isGeolocationGranted(): Promise<boolean> {
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state === 'granted';
  } catch {
    // No Permissions API, or one refusing the geolocation name (older Safari): fall back to asking.
    return true;
  }
}

/** `request` is a user-gesture fix, the only reliable moment to raise a permission prompt in a PWA. */
export function useCurrentLocation(active: boolean) {
  const [location, setLocation] = useState<Coords | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (!active) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;

    let stopped = false;
    let watchId: number | null = null;
    let timer: number | undefined;

    const accept = (position: GeolocationPosition) => {
      if (stopped) return;
      setLocation(coordsOf(position));
    };

    const stopWatch = () => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      watchId = null;
    };

    const track = () => {
      if (stopped) return;
      navigator.geolocation.getCurrentPosition(accept, () => {}, FIX_OPTIONS);
      watchId = navigator.geolocation.watchPosition(
        accept,
        () => {},
        WATCH_OPTIONS,
      );
      timer = window.setTimeout(stopWatch, WATCH_MS);
    };

    void isGeolocationGranted().then((granted) => {
      if (granted) track();
    });

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stopWatch();
    };
  }, [active]);

  const request = useCallback(
    () =>
      new Promise<LocationResult>((resolve) => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
          resolve({ ok: false, reason: 'unavailable' });
          return;
        }
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const next = coordsOf(position);
            setLocating(false);
            setLocation(next);
            resolve({ ok: true, location: next });
          },
          (error) => {
            setLocating(false);
            resolve({ ok: false, reason: classifyLocationError(error) });
          },
          REQUEST_OPTIONS,
        );
      }),
    [],
  );

  return { location, locating, request };
}

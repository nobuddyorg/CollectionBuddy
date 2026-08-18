'use client';
import { useCallback, useEffect, useState } from 'react';

export interface Coords {
  lat: number;
  lng: number;
}

export type LocationFailure = 'denied' | 'unavailable';

export type LocationResult =
  { ok: true; location: Coords } | { ok: false; reason: LocationFailure };

// Stryker disable all: a test asserting a 12-second timeout can only
// restate the 12 seconds, not judge whether it's right.
const FIX_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 12000,
  maximumAge: 0,
};

// The "where am I" tap accepts a recent fix -- re-arming the GPS to learn
// the same thing costs seconds.
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

// How long to keep refining the first fix -- the pin stops visibly
// improving well before a watch left open that long would matter.
const WATCH_MS = 10000;

const coordsOf = (position: GeolocationPosition): Coords => ({
  lat: position.coords.latitude,
  lng: position.coords.longitude,
});
// Stryker restore all

/**
 * Separates "you said no" from every other way a fix can fail -- the two
 * need different advice, and only the first is something the user can undo.
 */
export function classifyLocationError(error: {
  code?: number;
}): LocationFailure {
  // GeolocationPositionError.PERMISSION_DENIED, spelled out because the
  // constant lives on an instance that jsdom does not construct.
  return error?.code === 1 ? 'denied' : 'unavailable';
}

/**
 * Reads whether geolocation may be used *without* prompting. A prompt
 * raised the moment a screen mounts has no visible cause and gets
 * dismissed, and enough dismissals earn a permanent, unreversible block --
 * so only an already-granted permission is spent automatically.
 */
export async function isGeolocationGranted(): Promise<boolean> {
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state === 'granted';
  } catch {
    // No Permissions API, or one refusing the geolocation name (older
    // Safari): fall back to asking.
    return true;
  }
}

/**
 * The current position for the map, and a way to ask for it on purpose.
 * `request` is a user-gesture-driven fix, the only reliable moment to raise
 * a permission prompt in a standalone PWA.
 */
// Stryker disable all: this hook's mutants would only report on how
// thoroughly the navigator API is stubbed. The pure functions above carry
// the logic worth scoring.
export function useCurrentLocation(active: boolean) {
  const [location, setLocation] = useState<Coords | null>(null);
  const [locating, setLocating] = useState(false);

  /* v8 ignore start -- browser geolocation: callbacks, watch lifetime and
   * teardown, none of it separable from the navigator API here. */
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
  /* v8 ignore stop */

  return { location, locating, request };
}
// Stryker restore all

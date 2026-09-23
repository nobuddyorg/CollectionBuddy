import type { LatLngBounds } from 'leaflet';

export type CopyRange = [number, number];

// A pin exists at one coordinate, so it is drawn once per visible world copy or panning loses it.
export const WORLD_WIDTH_DEG = 360;

// Copy `c` spans [c*360-180, c*360+180]; the +180 shift lines the floor up with Leaflet's copy edges.
export const visibleCopyRange = (bounds: LatLngBounds): CopyRange => [
  Math.floor((bounds.getWest() + 180) / WORLD_WIDTH_DEG),
  Math.floor((bounds.getEast() + 180) / WORLD_WIDTH_DEG),
];

export const sameRange = (a: CopyRange | null, b: CopyRange): boolean =>
  a !== null && a[0] === b[0] && a[1] === b[1];

/** The longitude shift of each visible world copy, west to east. */
export const copyOffsets = (copyMin: number, copyMax: number): number[] =>
  Array.from(
    { length: copyMax - copyMin + 1 },
    (_, i) => (copyMin + i) * WORLD_WIDTH_DEG,
  );

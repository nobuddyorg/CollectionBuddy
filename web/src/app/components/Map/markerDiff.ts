import type { MarkerInput } from './types';

/** Everything a drawn pin shows, so a pin whose popup changed is redrawn too. */
export function markerKey(marker: MarkerInput): string {
  return JSON.stringify([
    marker.lat,
    marker.lng,
    marker.popupText,
    marker.titles ?? [],
    marker.countLabel ?? '',
  ]);
}

/**
 * What changed between the pins on the map and the pins wanted: which to
 * draw and which to take away. Unchanged pins are left alone, so pins landing
 * one at a time cost one marker each rather than a rebuild of all (#628).
 */
export function diffMarkers(
  drawnKeys: ReadonlySet<string>,
  wanted: readonly MarkerInput[],
): { add: Map<string, MarkerInput>; removeKeys: string[] } {
  const wantedByKey = new Map(wanted.map((m) => [markerKey(m), m] as const));
  const add = new Map([...wantedByKey].filter(([key]) => !drawnKeys.has(key)));
  const removeKeys = [...drawnKeys].filter((key) => !wantedByKey.has(key));
  return { add, removeKeys };
}

/** The slice of a Leaflet map this needs; `_animatingZoom` is Leaflet's own private flag. */
export interface ZoomingMap {
  _animatingZoom?: boolean;
  once(type: 'zoomend', fn: () => void): unknown;
  off(type: 'zoomend', fn: () => void): unknown;
}

/** Runs `framing` now, or when the running zoom animation ends: Leaflet 1.9 drops a setView issued mid-animation. Returns the cancel. */
export function afterZoomAnimation(
  map: ZoomingMap,
  framing: () => void,
): () => void {
  if (map._animatingZoom) map.once('zoomend', framing);
  else framing();
  return () => map.off('zoomend', framing);
}

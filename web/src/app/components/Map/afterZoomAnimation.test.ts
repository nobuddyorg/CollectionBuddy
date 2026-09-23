import { describe, expect, it, vi } from 'vitest';

import { afterZoomAnimation, type ZoomingMap } from './afterZoomAnimation';

/** A map that keeps its listeners per event type, and ends a zoom animation the way Leaflet does: flag first, then zoomend. */
function fakeMap(animating: boolean) {
  const listeners = new globalThis.Map<string, Set<() => void>>();
  const on = (type: string) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    return listeners.get(type)!;
  };
  const map: ZoomingMap = {
    _animatingZoom: animating,
    once: (type, fn) => on(type).add(fn),
    off: (type, fn) => on(type).delete(fn),
  };
  const endZoom = () => {
    map._animatingZoom = false;
    const waiting = [...on('zoomend')];
    on('zoomend').clear();
    for (const fn of waiting) fn();
  };
  return { map, endZoom };
}

describe('afterZoomAnimation', () => {
  it('frames at once when no zoom is animating', () => {
    const { map, endZoom } = fakeMap(false);
    const framing = vi.fn();

    afterZoomAnimation(map, framing);
    expect(framing).toHaveBeenCalledTimes(1);

    endZoom();
    expect(framing).toHaveBeenCalledTimes(1);
  });

  it('waits for a running zoom animation to end, then frames once', () => {
    const { map, endZoom } = fakeMap(true);
    const framing = vi.fn();

    afterZoomAnimation(map, framing);
    expect(framing).not.toHaveBeenCalled();

    endZoom();
    expect(framing).toHaveBeenCalledTimes(1);
  });

  it('never frames once cancelled before the animation ends', () => {
    const { map, endZoom } = fakeMap(true);
    const framing = vi.fn();

    afterZoomAnimation(map, framing)();
    endZoom();

    expect(framing).not.toHaveBeenCalled();
  });

  it('leaves an immediate framing alone when cancelled afterwards', () => {
    const { map } = fakeMap(false);
    const framing = vi.fn();

    afterZoomAnimation(map, framing)();

    expect(framing).toHaveBeenCalledTimes(1);
  });
});

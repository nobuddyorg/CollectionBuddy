import { describe, expect, it, vi } from 'vitest';

import { afterZoomAnimation, type ZoomingMap } from './afterZoomAnimation';

/** Ends a zoom animation the way Leaflet does: flag first, then zoomend. */
function fakeMap(animating: boolean) {
  const listeners = new globalThis.Map<string, Set<() => void>>();
  const on = (type: string) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    return listeners.get(type)!;
  };
  const map: ZoomingMap = {
    _animatingZoom: animating,
    once: (type, handler) => on(type).add(handler),
    off: (type, handler) => on(type).delete(handler),
  };
  const endZoom = () => {
    map._animatingZoom = false;
    const waiting = [...on('zoomend')];
    on('zoomend').clear();
    for (const handler of waiting) handler();
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

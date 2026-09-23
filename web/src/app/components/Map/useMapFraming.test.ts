// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useMapFraming } from './useMapFraming';

function renderFraming(open = true) {
  return renderHook(({ isOpen }) => useMapFraming(isOpen), {
    initialProps: { isOpen: open },
  });
}

describe('useMapFraming', () => {
  it('starts with nothing to frame', () => {
    const { result } = renderFraming();

    expect(result.current.command).toBeNull();
  });

  it('frames a tap when it is carried out, numbering every command', () => {
    const { result } = renderFraming();

    act(() => result.current.tap('fitAll')());
    expect(result.current.command).toEqual({ kind: 'fitAll', id: 1 });

    act(() => result.current.tap('fitAll')());
    expect(result.current.command).toEqual({ kind: 'fitAll', id: 2 });
  });

  // The #694 race: "zoom to me" waits for a fix, "show all" is tapped
  // meanwhile, and the fix arriving afterwards must not undo the later tap.
  it('drops a tap that a later one overtook while it was waiting', () => {
    const { result } = renderFraming();

    let zoomToMe = () => {};
    act(() => {
      zoomToMe = result.current.tap('fitCurrent');
    });
    act(() => result.current.tap('fitAll')());
    act(() => zoomToMe());

    expect(result.current.command).toEqual({ kind: 'fitAll', id: 1 });
  });

  it('frames everything automatically while nobody has tapped', () => {
    const { result } = renderFraming();

    act(() => result.current.frameAllAutomatically());

    expect(result.current.command).toEqual({ kind: 'fitAll', id: 1 });
  });

  // Geocoding finishing a moment later must not pull the viewer away from
  // where they asked to look, whether the fix is still coming or arrived.
  it('never re-frames automatically over a request for the current location', () => {
    const { result } = renderFraming();

    let zoomToMe = () => {};
    act(() => {
      zoomToMe = result.current.tap('fitCurrent');
    });
    act(() => result.current.frameAllAutomatically());
    expect(result.current.command).toBeNull();

    act(() => zoomToMe());
    act(() => result.current.frameAllAutomatically());
    expect(result.current.command).toEqual({ kind: 'fitCurrent', id: 1 });
  });

  // Asking for everything and then getting everything is no override.
  it('still re-frames automatically after a tap that asked for everything', () => {
    const { result } = renderFraming();

    act(() => result.current.tap('fitAll')());
    act(() => result.current.frameAllAutomatically());

    expect(result.current.command).toEqual({ kind: 'fitAll', id: 2 });
  });

  it('forgets the last command and the last tap once the map closes', () => {
    const { result, rerender } = renderFraming();
    act(() => result.current.tap('fitCurrent')());

    rerender({ isOpen: false });
    expect(result.current.command).toBeNull();

    rerender({ isOpen: true });
    act(() => result.current.frameAllAutomatically());
    expect(result.current.command).toEqual({ kind: 'fitAll', id: 1 });
  });

  // A fix arriving after the map was closed belongs to a visit that ended.
  it('drops a tap still waiting when the map closed', () => {
    const { result, rerender } = renderFraming();
    let zoomToMe = () => {};
    act(() => {
      zoomToMe = result.current.tap('fitCurrent');
    });

    rerender({ isOpen: false });
    rerender({ isOpen: true });
    act(() => zoomToMe());

    expect(result.current.command).toBeNull();
  });

  it('keeps one identity for its callbacks across re-renders', () => {
    const { result, rerender } = renderFraming();
    const { tap, frameAllAutomatically } = result.current;

    rerender({ isOpen: true });

    expect(result.current.tap).toBe(tap);
    expect(result.current.frameAllAutomatically).toBe(frameAllAutomatically);
  });
});

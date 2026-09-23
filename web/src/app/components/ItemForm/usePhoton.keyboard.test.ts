// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePhotonSearch } from './usePhoton';
import type { PhotonFeature, PlaceChoice } from './types';

function feature(
  osm_id: number,
  partial: Partial<PhotonFeature['properties']> = {},
): PhotonFeature {
  return {
    properties: {
      osm_id,
      osm_type: 'N',
      osm_key: 'place',
      osm_value: 'city',
      ...partial,
    },
    geometry: { type: 'Point', coordinates: [0, 0] },
  };
}

function keyEvent(key: string) {
  const preventDefault = vi.fn();
  const stopPropagation = vi.fn();
  return {
    event: {
      key,
      preventDefault,
      stopPropagation,
    } as unknown as React.KeyboardEvent<HTMLInputElement>,
    preventDefault,
    stopPropagation,
  };
}

// Drives a real search to completion so `results` is genuinely populated, rather than poking hook state.
async function searchAndGetResults(features: PhotonFeature[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features }),
    }),
  );
  const { result } = renderHook(() => usePhotonSearch('en'));
  act(() => {
    result.current.setFocus(true);
    result.current.setQuery('Col');
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
  return result;
}

describe('usePhotonSearch onKeyDown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('moves the active index down and wraps from the last option to the first', async () => {
    const result = await searchAndGetResults([
      feature(1, { city: 'Cologne' }),
      feature(2, { city: 'Colmar' }),
    ]);

    act(() => {
      result.current.onKeyDown(keyEvent('ArrowDown').event);
    });
    expect(result.current.activeIndex).toBe(0);

    act(() => {
      result.current.onKeyDown(keyEvent('ArrowDown').event);
    });
    expect(result.current.activeIndex).toBe(1);

    act(() => {
      result.current.onKeyDown(keyEvent('ArrowDown').event);
    });
    expect(result.current.activeIndex).toBe(0);
  });

  it('moves the active index up and wraps from the first option to the last', async () => {
    const result = await searchAndGetResults([
      feature(1, { city: 'Cologne' }),
      feature(2, { city: 'Colmar' }),
      feature(3, { city: 'Colditz' }),
    ]);

    // From -1 (nothing chosen yet), ArrowUp goes straight to the last option, not out of range.
    act(() => {
      result.current.onKeyDown(keyEvent('ArrowUp').event);
    });
    expect(result.current.activeIndex).toBe(2);

    act(() => {
      result.current.onKeyDown(keyEvent('ArrowUp').event);
    });
    expect(result.current.activeIndex).toBe(1);

    act(() => {
      result.current.setActiveIndex(0);
    });
    act(() => {
      result.current.onKeyDown(keyEvent('ArrowUp').event);
    });
    expect(result.current.activeIndex).toBe(2);
  });

  it('preventDefaults ArrowUp so page scroll does not fight the menu', async () => {
    const result = await searchAndGetResults([feature(1, { city: 'Cologne' })]);
    const { event, preventDefault } = keyEvent('ArrowUp');

    act(() => {
      result.current.onKeyDown(event);
    });

    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it('Enter with no prior arrow key picks the first result', async () => {
    const result = await searchAndGetResults([
      feature(1, { city: 'Cologne' }),
      feature(2, { city: 'Colmar' }),
    ]);

    let choice: PlaceChoice | undefined;
    act(() => {
      choice = result.current.onKeyDown(keyEvent('Enter').event);
    });

    expect(choice?.label).toBe('Cologne');
  });

  it('Enter picks whichever option the arrow keys actually landed on', async () => {
    const result = await searchAndGetResults([
      feature(1, { city: 'Cologne' }),
      feature(2, { city: 'Colmar' }),
    ]);

    act(() => {
      result.current.onKeyDown(keyEvent('ArrowDown').event);
    });
    act(() => {
      result.current.onKeyDown(keyEvent('ArrowDown').event);
    });
    let choice: PlaceChoice | undefined;
    act(() => {
      choice = result.current.onKeyDown(keyEvent('Enter').event);
    });

    expect(choice?.label).toBe('Colmar');
  });

  it('does nothing on Enter when the active index no longer points at a real result', async () => {
    const result = await searchAndGetResults([feature(1, { city: 'Cologne' })]);
    act(() => {
      result.current.setActiveIndex(99);
    });

    let choice: PlaceChoice | undefined;
    act(() => {
      choice = result.current.onKeyDown(keyEvent('Enter').event);
    });

    expect(choice).toBeUndefined();
    expect(result.current.results).toHaveLength(1);
  });

  it('ignores a key that is none of ArrowUp/ArrowDown/Enter/Escape', async () => {
    const result = await searchAndGetResults([feature(1, { city: 'Cologne' })]);
    const { event, preventDefault, stopPropagation } = keyEvent('a');

    act(() => {
      result.current.onKeyDown(event);
    });

    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
    expect(result.current.results).toHaveLength(1);
    expect(result.current.focus).toBe(true);
  });

  it('stops Escape from propagating once suggestions are open, instead of only clearing local state', async () => {
    const result = await searchAndGetResults([feature(1, { city: 'Cologne' })]);
    expect(result.current.results.length).toBe(1);

    const { event, preventDefault, stopPropagation } = keyEvent('Escape');
    act(() => {
      result.current.onKeyDown(event);
    });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(result.current.results).toEqual([]);
  });

  it('leaves Escape alone when there is no suggestion menu to dismiss', () => {
    const { result } = renderHook(() => usePhotonSearch('en'));
    const { event, preventDefault, stopPropagation } = keyEvent('Escape');
    act(() => {
      result.current.onKeyDown(event);
    });
    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
  });
});

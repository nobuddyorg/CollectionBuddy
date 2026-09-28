// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  keyEvent,
  renderPhotonSearch,
  searchFor,
} from './usePhoton.hook.test-support';
import { feature, photonAnswer } from './usePhoton.test-support';
import type { PhotonFeature } from '../../data/photon';

// Drives a real search to completion so `results` is genuinely populated, rather than poking hook state.
async function searchAndGetResults(features: PhotonFeature[]) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(photonAnswer(features)));
  const search = renderPhotonSearch();
  await searchFor(search.result, 'Col');
  return search;
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
    const { result } = await searchAndGetResults([
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
    const { result } = await searchAndGetResults([
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
      result.current.onKeyDown(keyEvent('ArrowUp').event);
    });
    expect(result.current.activeIndex).toBe(0);

    act(() => {
      result.current.onKeyDown(keyEvent('ArrowUp').event);
    });
    expect(result.current.activeIndex).toBe(2);
  });

  it('preventDefaults ArrowUp so page scroll does not fight the menu', async () => {
    const { result } = await searchAndGetResults([
      feature(1, { city: 'Cologne' }),
    ]);
    const { event, preventDefault } = keyEvent('ArrowUp');

    act(() => {
      result.current.onKeyDown(event);
    });

    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it('Enter with no prior arrow key picks the first result', async () => {
    const { result, onPick } = await searchAndGetResults([
      feature(1, { city: 'Cologne' }),
      feature(2, { city: 'Colmar' }),
    ]);
    const { event, preventDefault } = keyEvent('Enter');

    act(() => {
      result.current.onKeyDown(event);
    });

    expect(onPick).toHaveBeenCalledExactlyOnceWith({
      label: 'Cologne',
      coords: { lat: 0, lng: 0 },
    });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(result.current.results).toEqual([]);
  });

  it('Enter picks whichever option the arrow keys actually landed on', async () => {
    const { result, onPick } = await searchAndGetResults([
      feature(1, { city: 'Cologne' }),
      feature(2, { city: 'Colmar' }),
    ]);

    act(() => {
      result.current.onKeyDown(keyEvent('ArrowDown').event);
    });
    act(() => {
      result.current.onKeyDown(keyEvent('ArrowDown').event);
    });
    act(() => {
      result.current.onKeyDown(keyEvent('Enter').event);
    });

    expect(onPick).toHaveBeenCalledExactlyOnceWith({
      label: 'Colmar',
      coords: { lat: 0, lng: 0 },
    });
  });

  it('ignores a key that is none of ArrowUp/ArrowDown/Enter/Escape', async () => {
    const { result, onPick } = await searchAndGetResults([
      feature(1, { city: 'Cologne' }),
    ]);
    const { event, preventDefault, stopPropagation } = keyEvent('a');

    act(() => {
      result.current.onKeyDown(event);
    });

    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
    expect(result.current.results).toHaveLength(1);
    expect(result.current.focus).toBe(true);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('stops Escape from propagating once suggestions are open, instead of only clearing local state', async () => {
    const { result, onPick } = await searchAndGetResults([
      feature(1, { city: 'Cologne' }),
    ]);
    expect(result.current.results.length).toBe(1);

    const { event, preventDefault, stopPropagation } = keyEvent('Escape');
    act(() => {
      result.current.onKeyDown(event);
    });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(result.current.results).toEqual([]);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('leaves Escape alone when there is no suggestion menu to dismiss', () => {
    const { result } = renderPhotonSearch();
    const { event, preventDefault, stopPropagation } = keyEvent('Escape');
    act(() => {
      result.current.onKeyDown(event);
    });
    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
  });
});

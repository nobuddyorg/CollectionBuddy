// @vitest-environment jsdom
import { act, render, renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { usePhotonSearch } from './usePhoton';
import { renderPhotonSearch } from './usePhoton.hook.test-support';
import { feature } from './usePhoton.test-support';
import type { PhotonFeature } from '../../data/photon';

describe('usePhotonSearch choose', () => {
  // `focus` stays `false`: set true first, the search effect's own focus reset would mask choose()'s work.
  it('clears results, resets the active index, and closes focus after picking', () => {
    const { result, onPick } = renderPhotonSearch();

    act(() => {
      result.current.choose(feature(1, { city: 'Cologne' }));
    });

    expect(result.current.results).toEqual([]);
    expect(result.current.activeIndex).toBe(-1);
    expect(result.current.focus).toBe(false);
    expect(onPick).toHaveBeenCalledExactlyOnceWith({
      label: 'Cologne',
      coords: { lat: 0, lng: 0 },
    });
  });

  it('keeps just the country from a state and country, not the whole second line', () => {
    const { result, onPick } = renderPhotonSearch();

    act(() => {
      result.current.choose(
        feature(1, { city: 'Cologne', state: 'NRW', country: 'Germany' }),
      );
    });

    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Cologne, Germany' }),
    );
  });

  it('uses whichever language is current when picked, not the one active when the hook first mounted', () => {
    const onPick = vi.fn();
    const { result, rerender } = renderHook(
      ({ language }) => usePhotonSearch({ language, onPick }),
      { initialProps: { language: 'de' } },
    );

    act(() => {
      result.current.choose(feature(1, { city: 'Cologne', countrycode: 'fr' }));
    });

    rerender({ language: 'en' });

    act(() => {
      result.current.choose(feature(1, { city: 'Cologne', countrycode: 'fr' }));
    });

    expect(onPick).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ label: 'Cologne, Frankreich' }),
    );
    expect(onPick).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ label: 'Cologne, France' }),
    );
  });

  it('reports a pick to the latest onPick it was given, not the one it mounted with', () => {
    const firstOnPick = vi.fn();
    const latestOnPick = vi.fn();
    const { result, rerender } = renderHook(
      ({ onPick }) => usePhotonSearch({ language: 'en', onPick }),
      { initialProps: { onPick: firstOnPick } },
    );

    rerender({ onPick: latestOnPick });
    act(() => {
      result.current.choose(feature(1, { city: 'Cologne' }));
    });

    expect(firstOnPick).not.toHaveBeenCalled();
    expect(latestOnPick).toHaveBeenCalledOnce();
  });
});

describe('usePhotonSearch initial state', () => {
  it('starts with nothing found, nothing loading, nothing failed, and nothing selected', () => {
    const { result } = renderPhotonSearch();

    expect(result.current.results).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(false);
    expect(result.current.searched).toBe(false);
    expect(result.current.activeIndex).toBe(-1);
  });

  // The mount effect resets all five, so only the first render pass can tell a wrong seed from a corrected one.
  it('paints its very first render already empty, never flashing a menu, a spinner or an error', () => {
    const passes: {
      results: PhotonFeature[];
      loading: boolean;
      error: boolean;
      searched: boolean;
      activeIndex: number;
    }[] = [];
    const onPick = vi.fn();
    function Probe() {
      const { results, loading, error, searched, activeIndex } =
        usePhotonSearch({ language: 'en', onPick });
      passes.push({ results, loading, error, searched, activeIndex });
      return null;
    }

    render(createElement(Probe));

    expect(passes[0]).toEqual({
      results: [],
      loading: false,
      error: false,
      searched: false,
      activeIndex: -1,
    });
  });
});

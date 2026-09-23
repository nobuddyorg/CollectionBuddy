// @vitest-environment jsdom
import { act, render, renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

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

describe('usePhotonSearch choose', () => {
  // `focus` stays `false`: set true first, the search effect's own focus reset would mask choose()'s work.
  it('clears results, resets the active index, and closes focus after picking', () => {
    const { result } = renderHook(() => usePhotonSearch('en'));

    let choice: PlaceChoice | undefined;
    act(() => {
      choice = result.current.choose(feature(1, { city: 'Cologne' }));
    });

    expect(result.current.results).toEqual([]);
    expect(result.current.activeIndex).toBe(-1);
    expect(result.current.focus).toBe(false);
    expect(choice).toEqual({
      label: 'Cologne',
      coords: { lat: 0, lng: 0 },
    });
  });

  it('keeps just the country from a state+country line2, not the whole thing', () => {
    const { result } = renderHook(() => usePhotonSearch('en'));

    let choice: PlaceChoice | undefined;
    act(() => {
      choice = result.current.choose(
        feature(1, { city: 'Cologne', state: 'NRW', country: 'Germany' }),
      );
    });

    expect(choice?.label).toBe('Cologne, Germany');
  });

  it('uses whichever locale is current when picked, not the one active when the hook first mounted', () => {
    const { result, rerender } = renderHook(
      ({ locale }) => usePhotonSearch(locale),
      { initialProps: { locale: 'de' } },
    );

    let germanChoice: PlaceChoice | undefined;
    act(() => {
      germanChoice = result.current.choose(
        feature(1, { city: 'Cologne', countrycode: 'fr' }),
      );
    });

    rerender({ locale: 'en' });

    let englishChoice: PlaceChoice | undefined;
    act(() => {
      englishChoice = result.current.choose(
        feature(1, { city: 'Cologne', countrycode: 'fr' }),
      );
    });

    expect(germanChoice?.label).not.toBe(englishChoice?.label);
  });
});

describe('usePhotonSearch initial state', () => {
  it('starts with an empty query', () => {
    const { result } = renderHook(() => usePhotonSearch('en'));

    expect(result.current.query).toBe('');
  });

  it('starts with nothing found, nothing loading, nothing failed, and nothing selected', () => {
    const { result } = renderHook(() => usePhotonSearch('en'));

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
    function Probe() {
      const { results, loading, error, searched, activeIndex } =
        usePhotonSearch('en');
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

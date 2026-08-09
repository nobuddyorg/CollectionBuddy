// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  dedupePhotonFeatures,
  formatPlaceDisplay,
  isQueryLongEnough,
  usePhotonSearch,
} from './usePhoton';
import type { PhotonFeature } from './types';

function props(
  partial: Partial<PhotonFeature['properties']> = {},
): PhotonFeature['properties'] {
  return {
    osm_id: 1,
    osm_type: 'N',
    osm_key: 'place',
    osm_value: 'city',
    ...partial,
  };
}

function feature(
  osm_id: number,
  partial: Partial<PhotonFeature['properties']> = {},
): PhotonFeature {
  return {
    properties: props({ osm_id, ...partial }),
    geometry: { type: 'Point', coordinates: [0, 0] },
  };
}

describe('formatPlaceDisplay', () => {
  it('prefers city, falling back through town/village/municipality/name', () => {
    expect(formatPlaceDisplay(props({ town: 'Smallville' }), null).city).toBe(
      'Smallville',
    );
    expect(
      formatPlaceDisplay(props({ city: 'Cologne', town: 'ignored' }), null)
        .city,
    ).toBe('Cologne');
  });

  it('joins state and country for the second line', () => {
    const { line2 } = formatPlaceDisplay(
      props({ state: 'NRW', country: 'Germany' }),
      null,
    );
    expect(line2).toBe('NRW, Germany');
  });

  it('omits a missing state or country instead of leaving a stray separator', () => {
    expect(formatPlaceDisplay(props({ country: 'Germany' }), null).line2).toBe(
      'Germany',
    );
    expect(formatPlaceDisplay(props({ state: 'NRW' }), null).line2).toBe('NRW');
  });

  it('falls back to an empty city when no name field is present at all', () => {
    expect(formatPlaceDisplay(props(), null).city).toBe('');
  });

  it('does not look up a region name when regionNames is unavailable, even with a countrycode', () => {
    expect(() =>
      formatPlaceDisplay(props({ countrycode: 'de' }), null),
    ).not.toThrow();
    expect(formatPlaceDisplay(props({ countrycode: 'de' }), null).line2).toBe(
      '',
    );
  });

  it('lowercases the dedupe key', () => {
    expect(formatPlaceDisplay(props({ city: 'COLOGNE' }), null).key).toBe(
      'cologne|||',
    );
  });

  it('collapses a run of whitespace to one separator, so it cannot merge two distinct names', () => {
    const collapsed = formatPlaceDisplay(props({ city: 'A\t\tB' }), null);
    const singleSpace = formatPlaceDisplay(props({ city: 'A B' }), null);
    expect(collapsed.key).toBe(singleSpace.key);

    const twoWords = formatPlaceDisplay(props({ city: 'New York' }), null);
    const oneWord = formatPlaceDisplay(props({ city: 'Newyork' }), null);
    expect(twoWords.key).not.toBe(oneWord.key);
  });

  it('produces the same dedupe key regardless of case or whitespace', () => {
    const a = formatPlaceDisplay(
      props({ city: 'Cologne', country: 'Germany' }),
      null,
    );
    const b = formatPlaceDisplay(
      props({ city: '  COLOGNE ', country: 'germany' }),
      null,
    );
    expect(a.key).toBe(b.key);
  });

  it('falls back to the region name when country is absent but countrycode is present', () => {
    const regionNames = {
      of: (code: string) => `Region:${code}`,
    } as Intl.DisplayNames;
    const { line2 } = formatPlaceDisplay(
      props({ countrycode: 'de' }),
      regionNames,
    );
    expect(line2).toBe('Region:DE');
  });
});

describe('dedupePhotonFeatures', () => {
  it('collapses two entries sharing an osm_id into one (last one wins)', () => {
    const a = feature(1, { city: 'Cologne' });
    const b = feature(1, { city: 'Different but same id' });
    expect(dedupePhotonFeatures([a, b], null)).toEqual([b]);
  });

  it('drops a later feature with a different osm_id but identical display', () => {
    const a = feature(1, { city: 'Cologne', country: 'Germany' });
    const b = feature(2, { city: 'Cologne', country: 'Germany' });
    expect(dedupePhotonFeatures([a, b], null)).toEqual([a]);
  });

  it('keeps features that are genuinely distinct', () => {
    const a = feature(1, { city: 'Cologne' });
    const b = feature(2, { city: 'Berlin' });
    expect(dedupePhotonFeatures([a, b], null)).toEqual([a, b]);
  });
});

describe('usePhotonSearch onKeyDown', () => {
  // Regression: Escape used to only clear local state, with neither
  // preventDefault() nor stopPropagation(). The keystroke then bubbled past
  // React's root to the modal's own window-level Escape listener, which
  // closed the entire create/edit form -- discarding a title, description
  // and tags along with the suggestion menu the user actually meant to
  // dismiss.
  it('stops Escape from propagating once suggestions are open, instead of only clearing local state', async () => {
    vi.useFakeTimers();
    try {
      const hit = feature(1, { city: 'Cologne' });
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ features: [hit] }),
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

      expect(result.current.results.length).toBe(1);

      const preventDefault = vi.fn();
      const stopPropagation = vi.fn();
      const event = {
        key: 'Escape',
        preventDefault,
        stopPropagation,
      } as unknown as React.KeyboardEvent<HTMLInputElement>;
      act(() => {
        result.current.onKeyDown(event);
      });

      expect(preventDefault).toHaveBeenCalledOnce();
      expect(stopPropagation).toHaveBeenCalledOnce();
      expect(result.current.results).toEqual([]);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('leaves Escape alone when there is no suggestion menu to dismiss', () => {
    const { result } = renderHook(() => usePhotonSearch('en'));
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const event = {
      key: 'Escape',
      preventDefault,
      stopPropagation,
    } as unknown as React.KeyboardEvent<HTMLInputElement>;
    act(() => {
      result.current.onKeyDown(event);
    });
    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
  });
});

describe('isQueryLongEnough', () => {
  it('rejects fewer than 3 characters', () => {
    expect(isQueryLongEnough('')).toBe(false);
    expect(isQueryLongEnough('a')).toBe(false);
    expect(isQueryLongEnough('ab')).toBe(false);
  });

  it('accepts exactly 3 characters', () => {
    expect(isQueryLongEnough('abc')).toBe(true);
  });

  it('accepts more than 3 characters', () => {
    expect(isQueryLongEnough('abcd')).toBe(true);
  });

  it('measures the trimmed length, not the raw length', () => {
    expect(isQueryLongEnough('  ab  ')).toBe(false);
    expect(isQueryLongEnough('  abc  ')).toBe(true);
  });

  // Regression: this used to hardcode 3 rather than deferring to
  // data/items.ts's searchMinLength, so a non-ASCII query -- which carries
  // more meaning per character -- waited for a third character here while
  // the PostgREST filter it's meant to match already fired at two.
  it('accepts a two-character non-ASCII query, matching the PostgREST filter', () => {
    expect(isQueryLongEnough('京')).toBe(false);
    expect(isQueryLongEnough('京都')).toBe(true);
  });
});

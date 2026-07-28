import { describe, expect, it } from 'vitest';

import {
  dedupePhotonFeatures,
  formatPlaceDisplay,
  isQueryLongEnough,
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
});

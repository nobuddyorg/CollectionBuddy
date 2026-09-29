import { describe, expect, it } from 'vitest';

import {
  dedupePhotonFeatures,
  formatPlaceDisplay,
  isQueryLongEnough,
  placeLabel,
} from './usePhoton';
import { feature, placeProperties } from './usePhoton.test-support';

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

describe('formatPlaceDisplay', () => {
  it('prefers city, falling back through town/village/municipality/name', () => {
    expect(
      formatPlaceDisplay(placeProperties({ town: 'Smallville' }), regionNames)
        .city,
    ).toBe('Smallville');
    expect(
      formatPlaceDisplay(
        placeProperties({ city: 'Cologne', town: 'ignored' }),
        regionNames,
      ).city,
    ).toBe('Cologne');
  });

  it('joins state and country for the second line', () => {
    const { line2 } = formatPlaceDisplay(
      placeProperties({ state: 'NRW', country: 'Germany' }),
      regionNames,
    );
    expect(line2).toBe('NRW, Germany');
  });

  it('omits a missing state or country instead of leaving a stray separator', () => {
    expect(
      formatPlaceDisplay(placeProperties({ country: 'Germany' }), regionNames)
        .line2,
    ).toBe('Germany');
    expect(
      formatPlaceDisplay(placeProperties({ state: 'NRW' }), regionNames).line2,
    ).toBe('NRW');
  });

  it('falls back to an empty city when no name field is present at all', () => {
    expect(formatPlaceDisplay(placeProperties(), regionNames).city).toBe('');
  });

  it('lowercases the dedupe key', () => {
    expect(
      formatPlaceDisplay(placeProperties({ city: 'COLOGNE' }), regionNames).key,
    ).toBe('cologne|||');
  });

  it('collapses a run of whitespace to one separator, so it cannot merge two distinct names', () => {
    const collapsed = formatPlaceDisplay(
      placeProperties({ city: 'A\t\tB' }),
      regionNames,
    );
    const singleSpace = formatPlaceDisplay(
      placeProperties({ city: 'A B' }),
      regionNames,
    );
    expect(collapsed.key).toBe(singleSpace.key);

    const twoWords = formatPlaceDisplay(
      placeProperties({ city: 'New York' }),
      regionNames,
    );
    const oneWord = formatPlaceDisplay(
      placeProperties({ city: 'Newyork' }),
      regionNames,
    );
    expect(twoWords.key).not.toBe(oneWord.key);
  });

  it('produces the same dedupe key regardless of case or whitespace', () => {
    const plain = formatPlaceDisplay(
      placeProperties({ city: 'Cologne', country: 'Germany' }),
      regionNames,
    );
    const shouted = formatPlaceDisplay(
      placeProperties({ city: '  COLOGNE ', country: 'germany' }),
      regionNames,
    );
    expect(plain.key).toBe(shouted.key);
  });

  it('falls back to the region name when country is absent but countrycode is present', () => {
    const fakeRegionNames = {
      of: (code: string) => `Region:${code}`,
    } as Intl.DisplayNames;
    const { country, line2 } = formatPlaceDisplay(
      placeProperties({ countrycode: 'de' }),
      fakeRegionNames,
    );
    expect(country).toBe('Region:DE');
    expect(line2).toBe('Region:DE');
  });

  it('reports the country on its own, apart from the state, and none when neither names one', () => {
    expect(
      formatPlaceDisplay(
        placeProperties({ state: 'NRW', country: 'Germany' }),
        regionNames,
      ).country,
    ).toBe('Germany');
    expect(
      formatPlaceDisplay(placeProperties({ state: 'NRW' }), regionNames)
        .country,
    ).toBeUndefined();
  });
});

describe('placeLabel', () => {
  it('pairs the city with its country, leaving the state out', () => {
    expect(
      placeLabel(
        placeProperties({ city: 'Cologne', state: 'NRW', country: 'Germany' }),
        regionNames,
      ),
    ).toBe('Cologne, Germany');
  });

  it('names the country the countrycode stands for when Photon sends no country name', () => {
    expect(
      placeLabel(
        placeProperties({ city: 'Strasbourg', countrycode: 'fr' }),
        regionNames,
      ),
    ).toBe('Strasbourg, France');
  });

  it('falls back to the state when there is no country', () => {
    expect(
      placeLabel(
        placeProperties({ city: 'Cologne', state: 'NRW' }),
        regionNames,
      ),
    ).toBe('Cologne, NRW');
  });

  it('is the city alone when there is neither a country nor a state', () => {
    expect(placeLabel(placeProperties({ city: 'Cologne' }), regionNames)).toBe(
      'Cologne',
    );
  });

  it('keeps a country name that contains a comma whole', () => {
    expect(
      placeLabel(
        placeProperties({ city: 'Seoul', country: 'Korea, Republic of' }),
        regionNames,
      ),
    ).toBe('Seoul, Korea, Republic of');
  });
});

describe('dedupePhotonFeatures', () => {
  it('collapses two entries sharing an osm_id into one (last one wins)', () => {
    const first = feature(1, { city: 'Cologne' });
    const second = feature(1, { city: 'Different but same id' });
    expect(dedupePhotonFeatures([first, second], regionNames)).toEqual([
      second,
    ]);
  });

  it('drops a later feature with a different osm_id but identical display', () => {
    const first = feature(1, { city: 'Cologne', country: 'Germany' });
    const second = feature(2, { city: 'Cologne', country: 'Germany' });
    expect(dedupePhotonFeatures([first, second], regionNames)).toEqual([first]);
  });

  it('keeps features that are genuinely distinct', () => {
    const first = feature(1, { city: 'Cologne' });
    const second = feature(2, { city: 'Berlin' });
    expect(dedupePhotonFeatures([first, second], regionNames)).toEqual([
      first,
      second,
    ]);
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

  it('holds a non-ASCII query to the same minimum, matching the PostgREST filter', () => {
    expect(isQueryLongEnough('京都')).toBe(false);
    expect(isQueryLongEnough('Köln')).toBe(true);
  });
});

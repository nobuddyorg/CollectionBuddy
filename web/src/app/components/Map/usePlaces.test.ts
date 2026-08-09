import { describe, expect, it } from 'vitest';

import {
  partitionByCache,
  partitionByStoredCoords,
  placeFromPhotonResponse,
  withTitles,
} from './usePlaces';
import type { PlaceCoords } from './types';
import type { ItemPlaceRow } from '../../data/items';

const cologne: PlaceCoords = { name: 'Cologne', lat: 50.94, lng: 6.96 };
const berlin: PlaceCoords = { name: 'Berlin', lat: 52.52, lng: 13.4 };

function photon(coordinates: unknown) {
  return { features: [{ geometry: { coordinates } }] };
}

function row(
  place: string | null,
  place_lat: number | null = null,
  place_lng: number | null = null,
  title = 'An entry',
): ItemPlaceRow {
  return { title, place, place_lat, place_lng };
}

describe('partitionByStoredCoords', () => {
  it('draws stored coordinates without a lookup, and lists the rest', () => {
    const { located, unlocated } = partitionByStoredCoords([
      row('Cologne', 50.94, 6.96),
      row('Paris'),
      row('Berlin', 52.52, 13.4),
    ]);
    expect(located).toEqual([cologne, berlin]);
    expect(unlocated).toEqual(['Paris']);
  });

  it('preserves input order within each side of the split', () => {
    const { located, unlocated } = partitionByStoredCoords([
      row('Berlin', 52.52, 13.4),
      row('Paris'),
      row('Cologne', 50.94, 6.96),
      row('Rome'),
    ]);
    expect(located).toEqual([berlin, cologne]);
    expect(unlocated).toEqual(['Paris', 'Rome']);
  });

  it('deduplicates a place repeated across items', () => {
    const { located, unlocated } = partitionByStoredCoords([
      row('Cologne', 50.94, 6.96),
      row('Cologne', 50.94, 6.96),
      row('Paris'),
      row('Paris'),
    ]);
    expect(located).toEqual([cologne]);
    expect(unlocated).toEqual(['Paris']);
  });

  it('spares a place a lookup when any one item located it', () => {
    // An item entered before 0015 alongside one entered after: the older
    // row has no coordinates, but the place is still known.
    const { located, unlocated } = partitionByStoredCoords([
      row('Cologne'),
      row('Cologne', 50.94, 6.96),
    ]);
    expect(located).toEqual([cologne]);
    expect(unlocated).toEqual([]);
  });

  it('falls back to a lookup when only one coordinate was stored', () => {
    expect(
      partitionByStoredCoords([row('Cologne', 50.94, null)]),
    ).toMatchObject({ located: [], unlocated: ['Cologne'] });
    expect(partitionByStoredCoords([row('Cologne', null, 6.96)])).toMatchObject(
      { located: [], unlocated: ['Cologne'] },
    );
  });

  it('falls back to a lookup rather than pinning a non-finite coordinate', () => {
    expect(partitionByStoredCoords([row('Broken', NaN, 6.96)])).toMatchObject({
      located: [],
      unlocated: ['Broken'],
    });
    expect(
      partitionByStoredCoords([row('Broken', 50.94, Infinity)]),
    ).toMatchObject({ located: [], unlocated: ['Broken'] });
  });

  it('treats zero coordinates as a real location, not a missing one', () => {
    expect(partitionByStoredCoords([row('Null Island', 0, 0)])).toMatchObject({
      located: [{ name: 'Null Island', lat: 0, lng: 0 }],
      unlocated: [],
    });
  });

  // Two items can name the same place and disagree about where it is -- one
  // entered by picking a suggestion, another edited by hand. The first
  // located row wins, so the pin does not jump about depending on the order
  // the rows happen to come back in.
  it('keeps the first coordinates given for a repeated place', () => {
    const { located } = partitionByStoredCoords([
      row('Cologne', 50.94, 6.96),
      row('Cologne', 1, 2),
    ]);
    expect(located).toEqual([cologne]);
  });

  it('ignores rows with no place at all', () => {
    const { located, unlocated, titles } = partitionByStoredCoords([
      row(null, 50.94, 6.96),
      row(''),
    ]);
    expect(located).toEqual([]);
    expect(unlocated).toEqual([]);
    // A row with no place has nowhere to be listed, so its title is not
    // collected either -- an unnamed key would draw a pin onto nothing.
    expect(titles.size).toBe(0);
  });

  it('has nothing to do for an empty row list', () => {
    expect(partitionByStoredCoords([])).toMatchObject({
      located: [],
      unlocated: [],
    });
  });
});

describe('partitionByStoredCoords, on the entries at each place', () => {
  it('collects every title catalogued at a place', () => {
    const { titles } = partitionByStoredCoords([
      row('Cologne', 50.94, 6.96, 'Seated Dime'),
      row('Cologne', 50.94, 6.96, 'Silver Eagle'),
      row('Berlin', 52.52, 13.4, 'Buffalo Nickel'),
    ]);
    expect(titles.get('Cologne')).toEqual(['Seated Dime', 'Silver Eagle']);
    expect(titles.get('Berlin')).toEqual(['Buffalo Nickel']);
  });

  it('keeps the order the rows came back in', () => {
    // The query orders newest first so the popup and the list agree; that
    // order is carried through rather than re-sorted here.
    const { titles } = partitionByStoredCoords([
      row('Cologne', 50.94, 6.96, 'Newest'),
      row('Cologne', 50.94, 6.96, 'Older'),
      row('Cologne', 50.94, 6.96, 'Oldest'),
    ]);
    expect(titles.get('Cologne')).toEqual(['Newest', 'Older', 'Oldest']);
  });

  it('lists an entry whose own row carried no coordinates', () => {
    // Entered before 0015, so it has no coordinates of its own -- but it is
    // catalogued at a place a neighbouring row does locate, and a popup
    // that skipped it would under-report the collection.
    const { located, titles } = partitionByStoredCoords([
      row('Cologne', null, null, 'Older entry'),
      row('Cologne', 50.94, 6.96, 'Newer entry'),
    ]);
    expect(located).toEqual([cologne]);
    expect(titles.get('Cologne')).toEqual(['Older entry', 'Newer entry']);
  });

  it('collects titles for a place still awaiting a lookup', () => {
    const { unlocated, titles } = partitionByStoredCoords([
      row('Paris', null, null, 'Napoleon Franc'),
    ]);
    expect(unlocated).toEqual(['Paris']);
    // The geocode has not happened yet, but the titles are already known --
    // they come from the rows, not from the gazetteer.
    expect(titles.get('Paris')).toEqual(['Napoleon Franc']);
  });

  it('keeps two entries that share a title', () => {
    // Duplicates are not collapsed: two coins of the same name are two
    // coins, and a popup showing one would be miscounting the collection.
    const { titles } = partitionByStoredCoords([
      row('Cologne', 50.94, 6.96, 'Seated Dime'),
      row('Cologne', 50.94, 6.96, 'Seated Dime'),
    ]);
    expect(titles.get('Cologne')).toEqual(['Seated Dime', 'Seated Dime']);
  });
});

describe('withTitles', () => {
  it('puts a located place back together with its entries', () => {
    expect(
      withTitles(cologne, new Map([['Cologne', ['Seated Dime']]])),
    ).toEqual({ ...cologne, titles: ['Seated Dime'] });
  });

  it('gives a place with no entries an empty list, not a missing one', () => {
    expect(withTitles(cologne, new Map())).toEqual({
      ...cologne,
      titles: [],
    });
  });

  it('matches on the place’s own name, not on some other entry', () => {
    expect(
      withTitles(cologne, new Map([['Berlin', ['Buffalo Nickel']]])).titles,
    ).toEqual([]);
  });

  it('leaves the coordinates exactly as they were', () => {
    const place = withTitles(berlin, new Map([['Berlin', ['A coin']]]));
    expect(place.name).toBe('Berlin');
    expect(place.lat).toBe(52.52);
    expect(place.lng).toBe(13.4);
  });
});

describe('partitionByCache', () => {
  it('returns cache hits as places and misses as names to look up', () => {
    const { cached, pending } = partitionByCache(
      ['Cologne', 'Paris', 'Berlin'],
      { Cologne: cologne, Berlin: berlin },
    );
    expect(cached).toEqual([cologne, berlin]);
    expect(pending).toEqual(['Paris']);
  });

  it('preserves input order within each side of the split', () => {
    const { cached, pending } = partitionByCache(
      ['Berlin', 'Paris', 'Cologne', 'Rome'],
      { Cologne: cologne, Berlin: berlin },
    );
    expect(cached).toEqual([berlin, cologne]);
    expect(pending).toEqual(['Paris', 'Rome']);
  });

  it('treats an empty cache as all pending', () => {
    expect(partitionByCache(['Paris'], {})).toEqual({
      cached: [],
      pending: ['Paris'],
    });
  });

  it('has nothing to do for an empty place list', () => {
    expect(partitionByCache([], { Cologne: cologne })).toEqual({
      cached: [],
      pending: [],
    });
  });
});

describe('placeFromPhotonResponse', () => {
  it('reads GeoJSON lng-first coordinates into lat/lng', () => {
    expect(placeFromPhotonResponse('Cologne', photon([6.96, 50.94]))).toEqual({
      name: 'Cologne',
      lat: 50.94,
      lng: 6.96,
    });
  });

  it('keeps the requested name rather than anything from the response', () => {
    expect(placeFromPhotonResponse('My Attic', photon([1, 2]))?.name).toBe(
      'My Attic',
    );
  });

  it('returns null when the query matched nothing', () => {
    expect(placeFromPhotonResponse('Nowhere', { features: [] })).toBeNull();
  });

  it('returns null for a response with no features at all', () => {
    expect(placeFromPhotonResponse('Nowhere', {})).toBeNull();
    expect(placeFromPhotonResponse('Nowhere', null)).toBeNull();
  });

  it('returns null for a malformed geometry instead of producing NaN pins', () => {
    expect(placeFromPhotonResponse('Broken', photon([6.96]))).toBeNull();
    expect(placeFromPhotonResponse('Broken', photon(undefined))).toBeNull();
    expect(placeFromPhotonResponse('Broken', photon(['6.96', '50.94']))).toBe(
      null,
    );
  });

  // Each coordinate is checked on its own. A pair where only one side is a
  // number is the dangerous shape: half of it is usable, so a check that
  // required *both* to be wrong before giving up would pin the place at
  // NaN -- which Leaflet draws nowhere, silently.
  it('returns null when only one of the two coordinates is a number', () => {
    expect(placeFromPhotonResponse('Half', photon([6.96, '50.94']))).toBeNull();
    expect(placeFromPhotonResponse('Half', photon(['6.96', 50.94]))).toBeNull();
    expect(placeFromPhotonResponse('Half', photon([6.96, null]))).toBeNull();
  });

  // Photon answers with GeoJSON, and a feature is not obliged to carry a
  // geometry. Reaching through it is how a missing one becomes a thrown
  // TypeError inside a geocoding worker, which is swallowed and reported as
  // "that place could not be found".
  it('returns null for a feature with nothing to read', () => {
    expect(placeFromPhotonResponse('Odd', { features: [null] })).toBeNull();
    expect(placeFromPhotonResponse('Odd', { features: [{}] })).toBeNull();
    expect(
      placeFromPhotonResponse('Odd', { features: [{ geometry: {} }] }),
    ).toBeNull();
  });
});

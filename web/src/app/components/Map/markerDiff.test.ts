import { describe, expect, it } from 'vitest';

import { diffMarkers, markerKey } from './markerDiff';
import type { MarkerInput } from './types';

const berlin: MarkerInput = {
  lat: 52.5,
  lng: 13.4,
  popupText: 'Berlin',
  titles: ['Dime'],
  countLabel: '1 entry',
};
const paris: MarkerInput = { lat: 48.9, lng: 2.35, popupText: 'Paris' };

describe('markerKey', () => {
  it('is the same for two pins that would draw identically', () => {
    expect(markerKey({ ...berlin })).toBe(markerKey(berlin));
  });

  it.each([
    ['latitude', { lat: 52.6 }],
    ['longitude', { lng: 13.5 }],
    ['place name', { popupText: 'Potsdam' }],
    ['entry titles', { titles: ['Dime', 'Nickel'] }],
    ['count label', { countLabel: '2 entries' }],
  ])('changes with the %s', (_, change) => {
    expect(markerKey({ ...berlin, ...change })).not.toBe(markerKey(berlin));
  });

  it('reads missing titles and count label as empty', () => {
    expect(markerKey(paris)).toBe(
      markerKey({ ...paris, titles: [], countLabel: '' }),
    );
  });
});

describe('diffMarkers', () => {
  it('draws every pin on an empty map', () => {
    const { add, removeKeys } = diffMarkers(new Set(), [berlin, paris]);

    expect([...add.values()]).toEqual([berlin, paris]);
    expect(removeKeys).toEqual([]);
  });

  it('draws only the pin that landed since, keyed for later removal', () => {
    const { add, removeKeys } = diffMarkers(new Set([markerKey(berlin)]), [
      berlin,
      paris,
    ]);

    expect([...add]).toEqual([[markerKey(paris), paris]]);
    expect(removeKeys).toEqual([]);
  });

  it('takes away pins no longer wanted', () => {
    const { add, removeKeys } = diffMarkers(
      new Set([markerKey(berlin), markerKey(paris)]),
      [paris],
    );

    expect(add.size).toBe(0);
    expect(removeKeys).toEqual([markerKey(berlin)]);
  });

  it('replaces a pin whose popup changed', () => {
    const renamed = { ...berlin, titles: ['Dime', 'Nickel'] };

    const { add, removeKeys } = diffMarkers(new Set([markerKey(berlin)]), [
      renamed,
    ]);

    expect([...add.values()]).toEqual([renamed]);
    expect(removeKeys).toEqual([markerKey(berlin)]);
  });
});

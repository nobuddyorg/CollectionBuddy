import { describe, expect, it, vi } from 'vitest';

import { needsLocating, withLocatedPlace } from './locatePlace';
import { EMPTY_ITEM_FORM_VALUES, type ItemFormValues } from './types';

const typed = (overrides: Partial<ItemFormValues> = {}): ItemFormValues => ({
  ...EMPTY_ITEM_FORM_VALUES,
  title: 'Silberdenar',
  place: 'Trier',
  ...overrides,
});

describe('needsLocating', () => {
  it('locates a place typed without coordinates', () => {
    expect(needsLocating(typed())).toBe(true);
  });

  it('leaves a picked place, which already has its coordinates', () => {
    expect(needsLocating(typed({ place_lat: 49.75, place_lng: 6.64 }))).toBe(
      false,
    );
  });

  it('treats zero coordinates as a real location, not a missing one', () => {
    expect(needsLocating(typed({ place_lat: 0, place_lng: 0 }))).toBe(false);
  });

  it('locates a place with only one coordinate, as the map would not pin it', () => {
    expect(needsLocating(typed({ place_lat: 49.75, place_lng: null }))).toBe(
      true,
    );
    expect(needsLocating(typed({ place_lat: null, place_lng: 6.64 }))).toBe(
      true,
    );
  });

  it('locates a place whose stored coordinate is not a finite number', () => {
    expect(
      needsLocating(typed({ place_lat: Number.NaN, place_lng: 6.64 })),
    ).toBe(true);
  });

  it('has nothing to locate without a place, blank or whitespace alone', () => {
    expect(needsLocating(typed({ place: '' }))).toBe(false);
    expect(needsLocating(typed({ place: '   ' }))).toBe(false);
  });
});

describe('withLocatedPlace', () => {
  it('stores the coordinates found for a typed place, and keeps everything else', async () => {
    const values = typed({ tags: ['Münze'] });

    expect(
      await withLocatedPlace(values, async () => ({ lat: 49.75, lng: 6.64 })),
    ).toEqual({ ...values, place_lat: 49.75, place_lng: 6.64 });
  });

  it('asks for the place as the database will store it, without surrounding blanks', async () => {
    const lookUp = vi.fn().mockResolvedValue(null);

    await withLocatedPlace(typed({ place: '  Trier ' }), lookUp);

    expect(lookUp).toHaveBeenCalledWith('Trier');
  });

  it('saves the place as typed when the lookup finds nothing', async () => {
    const values = typed();

    expect(await withLocatedPlace(values, async () => null)).toBe(values);
  });

  it('asks nothing for a place that already has its coordinates', async () => {
    const lookUp = vi.fn();
    const values = typed({ place_lat: 49.75, place_lng: 6.64 });

    expect(await withLocatedPlace(values, lookUp)).toBe(values);
    expect(lookUp).not.toHaveBeenCalled();
  });

  it('asks nothing for an entry without a place', async () => {
    const lookUp = vi.fn();

    await withLocatedPlace(typed({ place: '' }), lookUp);

    expect(lookUp).not.toHaveBeenCalled();
  });
});

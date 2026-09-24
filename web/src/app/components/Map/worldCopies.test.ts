import { describe, expect, it } from 'vitest';

import type { LatLngBounds } from 'leaflet';

import {
  WORLD_WIDTH_DEG,
  copyOffsets,
  sameRange,
  visibleCopyRange,
} from './worldCopies';

function bounds(west: number, east: number): LatLngBounds {
  return { getWest: () => west, getEast: () => east } as LatLngBounds;
}

describe('visibleCopyRange', () => {
  it('reads a view inside the primary copy as that copy alone', () => {
    expect(visibleCopyRange(bounds(-10, 40))).toEqual([0, 0]);
  });

  it('counts the whole primary copy, edge to edge, as one copy', () => {
    expect(visibleCopyRange(bounds(-180, 179.9))).toEqual([0, 0]);
  });

  it('spans two copies once the view crosses the antimeridian eastwards', () => {
    expect(visibleCopyRange(bounds(170, 190))).toEqual([0, 1]);
  });

  it('spans two copies once the view crosses the antimeridian westwards', () => {
    expect(visibleCopyRange(bounds(-190, -170))).toEqual([-1, 0]);
  });

  it('is one world copy wide at longitude 180, not off by one across half a copy', () => {
    expect(visibleCopyRange(bounds(180, 200))).toEqual([1, 1]);
    expect(visibleCopyRange(bounds(-200, -180.1))).toEqual([-1, -1]);
  });

  it('covers every copy of a view wider than the world', () => {
    expect(visibleCopyRange(bounds(-400, 400))).toEqual([-1, 1]);
  });
});

describe('sameRange', () => {
  it('never matches before any range was drawn', () => {
    expect(sameRange(null, [0, 0])).toBe(false);
  });

  it('matches a range with the same ends', () => {
    expect(sameRange([-1, 1], [-1, 1])).toBe(true);
  });

  it('differs when either end moved', () => {
    expect(sameRange([0, 0], [0, 1])).toBe(false);
    expect(sameRange([0, 1], [-1, 1])).toBe(false);
  });
});

describe('copyOffsets', () => {
  it('shifts nothing for the primary copy alone', () => {
    expect(copyOffsets(0, 0)).toEqual([0]);
  });

  it('lists one world width per copy, west to east', () => {
    expect(copyOffsets(-1, 1)).toEqual([-WORLD_WIDTH_DEG, 0, WORLD_WIDTH_DEG]);
  });

  it('starts from the westmost copy, not from the primary one', () => {
    expect(copyOffsets(1, 2)).toEqual([WORLD_WIDTH_DEG, 2 * WORLD_WIDTH_DEG]);
  });
});

import { describe, expect, it } from 'vitest';

import { fitWithin } from './photoDimensions';

describe('fitWithin', () => {
  it('shrinks a landscape photograph until its width is the limit', () => {
    expect(fitWithin({ width: 3000, height: 2000 }, 1000)).toEqual({
      width: 1000,
      height: 667,
    });
  });

  it('shrinks a portrait photograph until its height is the limit', () => {
    expect(fitWithin({ width: 2000, height: 3000 }, 600)).toEqual({
      width: 400,
      height: 600,
    });
  });

  it('rounds each side to the nearest whole pixel, up as well as down', () => {
    expect(fitWithin({ width: 2000, height: 3000 }, 1000)).toEqual({
      width: 667,
      height: 1000,
    });
    expect(fitWithin({ width: 3001, height: 1000 }, 1000)).toEqual({
      width: 1000,
      height: 333,
    });
  });

  it('leaves a photograph already within the limit as it is', () => {
    expect(fitWithin({ width: 800, height: 600 }, 1000)).toEqual({
      width: 800,
      height: 600,
    });
  });

  it('leaves a photograph exactly at the limit as it is', () => {
    expect(fitWithin({ width: 1000, height: 1000 }, 1000)).toEqual({
      width: 1000,
      height: 1000,
    });
  });

  it('keeps at least one pixel on a side a very long strip would round away', () => {
    expect(fitWithin({ width: 10_000, height: 1 }, 1000)).toEqual({
      width: 1000,
      height: 1,
    });
    expect(fitWithin({ width: 1, height: 10_000 }, 1000)).toEqual({
      width: 1,
      height: 1000,
    });
  });
});

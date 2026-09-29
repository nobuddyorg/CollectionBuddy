import fc from 'fast-check';
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

const anySide = fc.integer({ min: 1, max: 20_000 });
const anyLimit = fc.integer({ min: 1, max: 5_000 });

describe('fitWithin, for any photograph and limit', () => {
  it('never enlarges either side', () => {
    fc.assert(
      fc.property(anySide, anySide, anyLimit, (width, height, limit) => {
        const fitted = fitWithin({ width, height }, limit);
        expect(fitted.width).toBeLessThanOrEqual(width);
        expect(fitted.height).toBeLessThanOrEqual(height);
      }),
    );
  });

  it('brings the longest side to the limit exactly when it was over, and keeps both sides whole and at least 1px', () => {
    fc.assert(
      fc.property(anySide, anySide, anyLimit, (width, height, limit) => {
        const fitted = fitWithin({ width, height }, limit);
        const longest = Math.max(fitted.width, fitted.height);
        expect(longest).toBe(Math.min(limit, Math.max(width, height)));
        for (const side of [fitted.width, fitted.height]) {
          expect(Number.isInteger(side)).toBe(true);
          expect(side).toBeGreaterThanOrEqual(1);
        }
      }),
    );
  });

  it('keeps the aspect ratio, within the half pixel rounding costs each side', () => {
    fc.assert(
      fc.property(anySide, anySide, anyLimit, (width, height, limit) => {
        const fitted = fitWithin({ width, height }, limit);
        const scale = Math.min(1, limit / Math.max(width, height));
        const exactWidth = Math.max(1, width * scale);
        const exactHeight = Math.max(1, height * scale);
        expect(Math.abs(fitted.width - exactWidth)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(fitted.height - exactHeight)).toBeLessThanOrEqual(0.5);
      }),
    );
  });
});

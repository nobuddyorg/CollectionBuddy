import { describe, expect, it } from 'vitest';

import type { MaskAnalysis } from './coinMask';
import {
  cropWithAlpha,
  cutoutAlpha,
  fitWithin,
  opaqueBounds,
} from './coinCutoutImage';

describe('fitWithin', () => {
  it('scales a large landscape photo so its width is the cap', () => {
    expect(fitWithin({ width: 4000, height: 3000 }, 2000)).toEqual({
      width: 2000,
      height: 1500,
    });
  });

  it('scales a large portrait photo so its height is the cap', () => {
    expect(fitWithin({ width: 2252, height: 4000 }, 2048)).toEqual({
      width: 1153,
      height: 2048,
    });
  });

  it('never scales a small photo up', () => {
    expect(fitWithin({ width: 800, height: 600 }, 2048)).toEqual({
      width: 800,
      height: 600,
    });
  });

  it('keeps at least one pixel on a very thin side', () => {
    expect(fitWithin({ width: 10000, height: 1 }, 100)).toEqual({
      width: 100,
      height: 1,
    });
  });
});

const size = { width: 3, height: 1 };

function analysisWith(fillRatio: number): MaskAnalysis {
  return {
    mask: Uint8Array.from([0, 1, 1]),
    ellipse: {
      centerX: 1.5,
      centerY: 0.5,
      radiusX: 1.5,
      radiusY: 0.5,
      angle: 0,
    },
    fillRatio,
  };
}

describe('cutoutAlpha', () => {
  it('uses the ellipse when the fill ratio reaches the minimum', () => {
    const { alpha, mode } = cutoutAlpha({
      analysis: analysisWith(0.9),
      modelAlpha: [0, 255, 255],
      size,
      minFillRatio: 0.9,
    });

    expect(mode).toBe('ellipse');
    expect(Array.from(alpha)).toEqual([201, 255, 201]);
  });

  it('falls back to the cleaned mask below the minimum', () => {
    const { mode } = cutoutAlpha({
      analysis: analysisWith(0.89),
      modelAlpha: [0, 255, 255],
      size,
      minFillRatio: 0.9,
    });

    expect(mode).toBe('mask');
  });

  it("keeps the model's soft rim inside the mask, opaque holes, and nothing outside", () => {
    const { alpha } = cutoutAlpha({
      analysis: { ...analysisWith(0), mask: Uint8Array.from([0, 1, 1, 1, 1]) },
      modelAlpha: [255, 128, 200, 255, 20],
      size: { width: 5, height: 1 },
      minFillRatio: 0.9,
    });

    expect(Array.from(alpha)).toEqual([0, 1, 145, 255, 255]);
  });
});

describe('opaqueBounds', () => {
  it('is the tightest box around every pixel with any opacity', () => {
    const alpha = [0, 0, 0, 0, 0, 0, 9, 0, 0, 1, 0, 0];

    expect(opaqueBounds(alpha, { width: 4, height: 3 })).toEqual({
      x: 1,
      y: 1,
      width: 2,
      height: 2,
    });
  });

  it('reaches the last row and column', () => {
    const alpha = [0, 0, 0, 5];

    expect(opaqueBounds(alpha, { width: 2, height: 2 })).toEqual({
      x: 1,
      y: 1,
      width: 1,
      height: 1,
    });
  });

  it('is one row high for opacity only in the first row', () => {
    expect(opaqueBounds([0, 7, 0, 0], { width: 2, height: 2 })).toEqual({
      x: 1,
      y: 0,
      width: 1,
      height: 1,
    });
  });

  it('is one column wide for opacity only in the first column', () => {
    expect(opaqueBounds([0, 0, 7, 0], { width: 2, height: 2 })).toEqual({
      x: 0,
      y: 1,
      width: 1,
      height: 1,
    });
  });

  it('keeps the whole frame when nothing is opaque', () => {
    expect(opaqueBounds([0, 0, 0, 0], { width: 2, height: 2 })).toEqual({
      x: 0,
      y: 0,
      width: 2,
      height: 2,
    });
  });
});

describe('cropWithAlpha', () => {
  it("copies the original photo's colours inside the box and takes the cut-out's alpha", () => {
    const pixels = [
      1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255, 10, 11, 12, 255, 13, 14, 15,
      255, 16, 17, 18, 255,
    ];
    const alpha = [0, 0, 0, 0, 100, 200];

    const cropped = cropWithAlpha({
      pixels,
      alpha,
      width: 3,
      box: { x: 1, y: 1, width: 2, height: 1 },
    });

    expect(Array.from(cropped)).toEqual([13, 14, 15, 100, 16, 17, 18, 200]);
  });

  it('walks every row and column of a box set into the photo', () => {
    // A 3x3 photo whose red channel numbers its pixels 0-8.
    const pixels = Array.from({ length: 9 }, (_, index) => [
      index,
      0,
      0,
      255,
    ]).flat();

    const cropped = cropWithAlpha({
      pixels,
      alpha: Array.from({ length: 9 }, () => 255),
      width: 3,
      box: { x: 1, y: 1, width: 2, height: 2 },
    });

    expect(Array.from(cropped).filter((_, index) => index % 4 === 0)).toEqual([
      4, 5, 7, 8,
    ]);
  });

  it('never makes a pixel more opaque than the photo already was', () => {
    const cropped = cropWithAlpha({
      pixels: [1, 2, 3, 50],
      alpha: [255],
      width: 1,
      box: { x: 0, y: 0, width: 1, height: 1 },
    });

    expect(Array.from(cropped)).toEqual([1, 2, 3, 50]);
  });
});

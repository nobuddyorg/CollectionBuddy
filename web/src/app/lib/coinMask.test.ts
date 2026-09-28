import { describe, expect, it } from 'vitest';

import {
  analyzeMask,
  edgeNeighbours,
  ellipseCoverage,
  isOpaque,
  type Ellipse,
} from './coinMask';

const WIDTH = 120;
const HEIGHT = 100;

/** A model-style alpha mask: 255 wherever `inside` holds at the pixel's centre, else 0. */
function alphaWhere(
  inside: (x: number, y: number) => boolean,
  width = WIDTH,
  height = HEIGHT,
): Uint8Array {
  const alpha = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (inside(x + 0.5, y + 0.5)) alpha[y * width + x] = 255;
    }
  }
  return alpha;
}

function insideEllipse({ centerX, centerY, radiusX, radiusY, angle }: Ellipse) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return (x: number, y: number) => {
    const dx = x - centerX;
    const dy = y - centerY;
    const along = (dx * cos + dy * sin) / radiusX;
    const across = (dy * cos - dx * sin) / radiusY;
    return along * along + across * across <= 1;
  };
}

const COIN: Ellipse = {
  centerX: 60,
  centerY: 50,
  radiusX: 40,
  radiusY: 28,
  angle: 0.4,
};

function count(mask: ArrayLike<number>): number {
  let total = 0;
  for (let index = 0; index < mask.length; index += 1) total += mask[index];
  return total;
}

describe('analyzeMask', () => {
  it('fits a perfect ellipse: centre, radii and turn, with a fill ratio near 1', () => {
    const analysis = analyzeMask(
      alphaWhere(insideEllipse(COIN)),
      WIDTH,
      HEIGHT,
    )!;

    // Point-symmetric about its centre, so the pixel centres average to it exactly.
    expect(analysis.ellipse.centerX).toBeCloseTo(60, 6);
    expect(analysis.ellipse.centerY).toBeCloseTo(50, 6);
    expect(Math.abs(analysis.ellipse.radiusX - 40)).toBeLessThan(0.5);
    expect(Math.abs(analysis.ellipse.radiusY - 28)).toBeLessThan(0.5);
    expect(Math.abs(analysis.ellipse.angle - 0.4)).toBeLessThan(0.02);
    expect(analysis.fillRatio).toBeGreaterThan(0.97);
  });

  it('keeps the blob itself as the mask, 1 inside and 0 outside', () => {
    const alpha = alphaWhere(insideEllipse(COIN));

    const { mask } = analyzeMask(alpha, WIDTH, HEIGHT)!;

    expect(Array.from(mask)).toEqual(Array.from(alpha, (value) => value / 255));
  });

  it('describes an upright ellipse with no turn and its longer radius along x', () => {
    const upright = { ...COIN, angle: 0 };

    const { ellipse } = analyzeMask(
      alphaWhere(insideEllipse(upright)),
      WIDTH,
      HEIGHT,
    )!;

    expect(ellipse.angle).toBeCloseTo(0, 5);
    expect(ellipse.radiusX).toBeGreaterThan(ellipse.radiusY);
  });

  it('fills holes the model left inside the coin, such as a shiny highlight', () => {
    const coin = insideEllipse(COIN);
    const withHoles = alphaWhere(
      (x, y) =>
        coin(x, y) &&
        Math.hypot(x - 50, y - 45) > 6 &&
        Math.hypot(x - 72, y - 55) > 4,
    );

    const analysis = analyzeMask(withHoles, WIDTH, HEIGHT)!;

    expect(count(analysis.mask)).toBe(count(alphaWhere(coin)) / 255);
    expect(analysis.fillRatio).toBeGreaterThan(0.97);
    expect(Math.abs(analysis.ellipse.radiusX - 40)).toBeLessThan(0.5);
  });

  // A notch open to the background is background, not a hole, whatever its shape.
  it('leaves a notch that reaches the background open', () => {
    const coin = insideEllipse({ ...COIN, angle: 0 });
    const notched = alphaWhere(
      (x, y) => coin(x, y) && !(Math.abs(y - 50) < 3 && x > 60),
    );

    const { mask } = analyzeMask(notched, WIDTH, HEIGHT)!;

    expect(mask[50 * WIDTH + 90]).toBe(0);
    expect(count(mask)).toBe(count(notched) / 255);
  });

  it('keeps the ellipse on the coin when a thin residue line sticks out of it', () => {
    const coin = insideEllipse({ ...COIN, radiusY: 40, angle: 0, centerX: 50 });
    const withResidue = alphaWhere(
      (x, y) => coin(x, y) || (Math.abs(y - 50) < 1 && x >= 50 && x < 118),
    );

    const analysis = analyzeMask(withResidue, WIDTH, HEIGHT)!;

    expect(Math.abs(analysis.ellipse.centerX - 50)).toBeLessThan(1);
    expect(Math.abs(analysis.ellipse.radiusY - 40)).toBeLessThan(1);
    expect(analysis.fillRatio).toBeGreaterThan(0.9);
    // The line is still in the cleaned mask, but the ellipse cuts it off.
    expect(analysis.mask[50 * WIDTH + 110]).toBe(1);
    const coverage = ellipseCoverage(analysis.ellipse, WIDTH, HEIGHT);
    expect(coverage[50 * WIDTH + 110]).toBe(0);
  });

  it('keeps only the largest of two blobs', () => {
    const big = insideEllipse({
      ...COIN,
      centerX: 45,
      radiusX: 30,
      radiusY: 30,
    });
    const small = (x: number, y: number) => Math.hypot(x - 105, y - 15) <= 8;

    const analysis = analyzeMask(
      alphaWhere((x, y) => big(x, y) || small(x, y)),
      WIDTH,
      HEIGHT,
    )!;

    expect(analysis.mask[15 * WIDTH + 105]).toBe(0);
    expect(analysis.mask[50 * WIDTH + 45]).toBe(1);
    expect(analysis.ellipse.centerX).toBeCloseTo(45, 0);
  });

  it('keeps the largest blob even when a smaller one comes first', () => {
    const small = (x: number, y: number) => Math.hypot(x - 10, y - 10) <= 5;
    const big = (x: number, y: number) => Math.hypot(x - 70, y - 60) <= 25;

    const analysis = analyzeMask(
      alphaWhere((x, y) => small(x, y) || big(x, y)),
      WIDTH,
      HEIGHT,
    )!;

    expect(analysis.mask[10 * WIDTH + 10]).toBe(0);
    expect(analysis.ellipse.centerX).toBeCloseTo(70, 0);
  });

  // Four-connected: pixels that touch only at a corner are two blobs, not one.
  it('does not join blobs that touch only diagonally', () => {
    const alpha = new Uint8Array(4 * 4);
    alpha[0] = 255;
    alpha[1] = 255;
    alpha[1 * 4 + 2] = 255;
    alpha[2 * 4 + 3] = 255;

    const { mask } = analyzeMask(alpha, 4, 4)!;

    expect(Array.from(mask)).toEqual([
      1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
  });

  it('joins neighbours across rows and columns, including at the right edge', () => {
    const alpha = new Uint8Array(3 * 3).fill(255);

    const { mask } = analyzeMask(alpha, 3, 3)!;

    expect(count(mask)).toBe(9);
  });

  it('does not wrap a blob from one row end to the next row start', () => {
    const alpha = new Uint8Array(3 * 2);
    alpha[2] = 255;
    alpha[3] = 255;
    alpha[4] = 255;

    const { mask } = analyzeMask(alpha, 3, 2)!;

    expect(Array.from(mask)).toEqual([0, 0, 0, 1, 1, 0]);
  });

  it('keeps the first of two blobs of the same size', () => {
    const alpha = new Uint8Array(5 * 1);
    alpha[0] = 255;
    alpha[4] = 255;

    const { mask } = analyzeMask(alpha, 5, 1)!;

    expect(Array.from(mask)).toEqual([1, 0, 0, 0, 0]);
  });

  // Each notch touches exactly one edge, so only that edge's seeds can tell it from a hole.
  it.each([
    ['top', 2, 0],
    ['bottom', 2, 4],
    ['left', 0, 2],
    ['right', 4, 2],
  ])(
    'leaves a notch reaching only the %s edge open, but fills a hole',
    (_, x, y) => {
      const alpha = new Uint8Array(5 * 5).fill(255);
      alpha[y * 5 + x] = 0;
      alpha[2 * 5 + 2] = 0;

      const { mask } = analyzeMask(alpha, 5, 5)!;

      expect(mask[y * 5 + x]).toBe(0);
      expect(mask[2 * 5 + 2]).toBe(1);
    },
  );

  it('returns null for an empty mask', () => {
    expect(
      analyzeMask(new Uint8Array(WIDTH * HEIGHT), WIDTH, HEIGHT),
    ).toBeNull();
  });

  it('counts alpha from 128 up as the object and below it as background', () => {
    expect(analyzeMask(new Uint8Array(16).fill(127), 4, 4)).toBeNull();
    expect(count(analyzeMask(new Uint8Array(16).fill(128), 4, 4)!.mask)).toBe(
      16,
    );
  });

  it('gives a square a fill ratio below 0.9, so its ellipse is not trusted', () => {
    const square = alphaWhere(
      (x, y) => Math.abs(x - 60) <= 30 && Math.abs(y - 50) <= 30,
    );

    expect(analyzeMask(square, WIDTH, HEIGHT)!.fillRatio).toBeLessThan(0.9);
  });

  it('gives an L shape a fill ratio far below an ellipse', () => {
    const shape = alphaWhere(
      (x, y) =>
        (x > 20 && x < 40 && y > 10 && y < 90) ||
        (x > 20 && x < 100 && y > 70 && y < 90),
    );

    expect(analyzeMask(shape, WIDTH, HEIGHT)!.fillRatio).toBeLessThan(0.7);
  });

  it('measures the fill ratio as overlap over union with the fitted ellipse', () => {
    const alpha = alphaWhere(
      (x, y) => Math.abs(x - 60) <= 30 && Math.abs(y - 50) <= 30,
    );
    const analysis = analyzeMask(alpha, WIDTH, HEIGHT)!;
    const ellipse = ellipseCoverage(analysis.ellipse, WIDTH, HEIGHT);
    let both = 0;
    let either = 0;
    for (let index = 0; index < alpha.length; index += 1) {
      const inMask = analysis.mask[index] === 1;
      const inEllipse = ellipse[index] >= 128;
      if (inMask && inEllipse) both += 1;
      if (inMask || inEllipse) either += 1;
    }

    expect(analysis.fillRatio).toBeCloseTo(both / either, 10);
  });
});

describe('isOpaque', () => {
  it('counts alpha from 128 up', () => {
    expect(isOpaque(127)).toBe(false);
    expect(isOpaque(128)).toBe(true);
    expect(isOpaque(255)).toBe(true);
  });
});

describe('edgeNeighbours', () => {
  // A 3x3 grid: 0 1 2 / 3 4 5 / 6 7 8.
  it('gives a middle pixel all four', () => {
    expect(edgeNeighbours(4, 3, 9)).toEqual([3, 5, 1, 7]);
  });

  it('gives a top-left corner only right and below', () => {
    expect(edgeNeighbours(0, 3, 9)).toEqual([1, 3]);
  });

  it('gives a bottom-right corner only left and above', () => {
    expect(edgeNeighbours(8, 3, 9)).toEqual([7, 5]);
  });

  it('never wraps from a row start to the previous row end, or back', () => {
    expect(edgeNeighbours(3, 3, 9)).toEqual([4, 0, 6]);
    expect(edgeNeighbours(2, 3, 9)).toEqual([1, 5]);
  });
});

describe('ellipseCoverage', () => {
  const circle: Ellipse = {
    centerX: 10,
    centerY: 10,
    radiusX: 6,
    radiusY: 6,
    angle: 0,
  };

  it('is opaque at the centre, transparent far outside, half-covered on the rim', () => {
    const coverage = ellipseCoverage(
      { ...circle, centerX: 10.5, centerY: 10.5 },
      20,
      20,
    );

    expect(coverage[10 * 20 + 10]).toBe(255);
    expect(coverage[0]).toBe(0);
    // The pixel whose centre (16.5, 10.5) lies exactly on the rim.
    expect(coverage[10 * 20 + 16]).toBe(128);
  });

  it('fades over about one pixel, not over the whole radius', () => {
    const coverage = ellipseCoverage(circle, 20, 20);

    expect(coverage[9 * 20 + 14]).toBe(255);
    expect(coverage[9 * 20 + 17]).toBe(0);
  });

  it('turns with the angle', () => {
    const lying = { ...circle, radiusX: 8, radiusY: 2 };
    const standing = { ...lying, angle: Math.PI / 2 };

    const flat = ellipseCoverage(lying, 20, 20);
    const upright = ellipseCoverage(standing, 20, 20);

    expect(flat[9 * 20 + 16]).toBe(255);
    expect(flat[3 * 20 + 9]).toBe(0);
    expect(upright[9 * 20 + 16]).toBe(0);
    expect(upright[3 * 20 + 9]).toBe(255);
  });

  it('turns clockwise for a positive angle in image coordinates, y pointing down', () => {
    const diagonal = {
      ...circle,
      radiusX: 8,
      radiusY: 1.5,
      angle: Math.PI / 4,
    };

    const coverage = ellipseCoverage(diagonal, 20, 20);

    expect(coverage[14 * 20 + 14]).toBe(255);
    expect(coverage[5 * 20 + 14]).toBe(0);
  });
});

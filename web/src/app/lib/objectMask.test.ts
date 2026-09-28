import { describe, expect, it } from 'vitest';

import {
  analyzeMask as analyzeMaskOf,
  edgeNeighbours,
  ellipseCoverage,
  isOpaque,
  type Ellipse,
} from './objectMask';

/** A plain black photo unless given one: every hole then looks like the background. */
function analyzeMask(
  alpha: ArrayLike<number>,
  width: number,
  height: number,
  pixels: ArrayLike<number> = new Uint8Array(width * height * 4),
) {
  return analyzeMaskOf({ alpha, pixels, width, height });
}

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

  it('drops a speck under 5% of the largest blob', () => {
    const big = (x: number, y: number) => Math.hypot(x - 45, y - 50) <= 30;
    const speck = (x: number, y: number) => Math.hypot(x - 105, y - 15) <= 3;

    const analysis = analyzeMask(
      alphaWhere((x, y) => big(x, y) || speck(x, y)),
      WIDTH,
      HEIGHT,
    )!;

    expect(analysis.mask[15 * WIDTH + 105]).toBe(0);
    expect(analysis.mask[50 * WIDTH + 45]).toBe(1);
    expect(analysis.ellipse.centerX).toBeCloseTo(45, 6);
  });

  // Earrings, or a coin's two sides photographed together: every real object stays.
  it('keeps a second object, and then trusts no single ellipse', () => {
    const left = (x: number, y: number) => Math.hypot(x - 30, y - 50) <= 20;
    const right = (x: number, y: number) => Math.hypot(x - 90, y - 50) <= 15;

    const analysis = analyzeMask(
      alphaWhere((x, y) => left(x, y) || right(x, y)),
      WIDTH,
      HEIGHT,
    )!;

    expect(analysis.mask[50 * WIDTH + 30]).toBe(1);
    expect(analysis.mask[50 * WIDTH + 90]).toBe(1);
    expect(analysis.fillRatio).toBeLessThan(0.7);
  });

  it('keeps a blob of exactly 5% of the largest, and drops one just under', () => {
    // A 20-pixel bar and, apart from it, one pixel: 1/20 is exactly 5%.
    const exact = new Uint8Array(30);
    exact.fill(255, 0, 20);
    exact[29] = 255;
    expect(analyzeMask(exact, 30, 1)!.mask[29]).toBe(1);

    const under = new Uint8Array(31);
    under.fill(255, 0, 21);
    under[30] = 255;
    expect(analyzeMask(under, 31, 1)!.mask[30]).toBe(0);
  });

  // Four-connected: a pixel touching the block only at a corner is a speck of its own.
  it('does not join a pixel that touches a blob only diagonally', () => {
    const alpha = new Uint8Array(10 * 10);
    for (let y = 0; y < 5; y += 1) alpha.fill(255, y * 10, y * 10 + 5);
    alpha[5 * 10 + 5] = 255;

    const { mask } = analyzeMask(alpha, 10, 10)!;

    expect(mask[5 * 10 + 5]).toBe(0);
    expect(count(mask)).toBe(25);
  });

  it('joins neighbours across rows and columns, including at the right edge', () => {
    const alpha = new Uint8Array(3 * 3).fill(255);

    const { mask } = analyzeMask(alpha, 3, 3)!;

    expect(count(mask)).toBe(9);
  });

  // A ring, a bracelet, a cup's handle: the hole is part of what was photographed.
  it("leaves a large enclosed hole open, such as a ring's centre", () => {
    const ring = alphaWhere((x, y) => {
      const distance = Math.hypot(x - 60, y - 50);
      return distance <= 40 && distance > 25;
    });

    const { mask } = analyzeMask(ring, WIDTH, HEIGHT)!;

    expect(mask[50 * WIDTH + 60]).toBe(0);
    expect(count(mask)).toBe(count(ring) / 255);
  });

  it('fills a hole of exactly 5% of the object, and not one just over', () => {
    // A 5x5 block less its four corners and a 1-pixel hole: 20 pixels of object, the hole exactly 5%.
    const exact = new Uint8Array(7 * 7);
    for (let y = 1; y < 6; y += 1) exact.fill(255, y * 7 + 1, y * 7 + 6);
    for (const index of [8, 12, 36, 40, 24]) exact[index] = 0;
    expect(analyzeMask(exact, 7, 7)!.mask[24]).toBe(1);

    // One pixel less on its top edge, open to the background: 19 pixels, so the hole is over 5%.
    const over = Uint8Array.from(exact);
    over[9] = 0;
    expect(analyzeMask(over, 7, 7)!.mask[24]).toBe(0);
  });

  // A stamp's picture, a painted plate: what the model missed inside is not the table it lies on.
  it('fills a large hole whose colour is not the background', () => {
    const ring = (x: number, y: number) => {
      const distance = Math.hypot(x - 60, y - 50);
      return distance <= 40 && distance > 25;
    };
    // Black table, brown inside the ring, which the model called background.
    const pixels = new Uint8Array(WIDTH * HEIGHT * 4);
    alphaWhere((x, y) => Math.hypot(x - 60, y - 50) <= 25).forEach(
      (inside, index) => {
        if (inside) pixels.set([150, 90, 40, 255], index * 4);
      },
    );

    const { mask } = analyzeMask(alphaWhere(ring), WIDTH, HEIGHT, pixels)!;

    expect(mask[50 * WIDTH + 60]).toBe(1);
  });

  it('keeps a large hole open when its colour is within 48 of the background, fills it beyond', () => {
    const ring = alphaWhere((x, y) => {
      const distance = Math.hypot(x - 60, y - 50);
      return distance <= 40 && distance > 25;
    });
    const centre = alphaWhere((x, y) => Math.hypot(x - 60, y - 50) <= 25);
    const photoWithCentre = (red: number) => {
      const pixels = new Uint8Array(WIDTH * HEIGHT * 4);
      centre.forEach((inside, index) => {
        if (inside) pixels[index * 4] = red;
      });
      return pixels;
    };

    const near = analyzeMask(ring, WIDTH, HEIGHT, photoWithCentre(48));
    const far = analyzeMask(ring, WIDTH, HEIGHT, photoWithCentre(49));

    expect(near!.mask[50 * WIDTH + 60]).toBe(0);
    expect(far!.mask[50 * WIDTH + 60]).toBe(1);
  });

  it('compares every colour channel, not only red', () => {
    const ring = alphaWhere((x, y) => {
      const distance = Math.hypot(x - 60, y - 50);
      return distance <= 40 && distance > 25;
    });
    const pixels = new Uint8Array(WIDTH * HEIGHT * 4);
    alphaWhere((x, y) => Math.hypot(x - 60, y - 50) <= 25).forEach(
      (inside, index) => {
        if (inside) pixels.set([0, 40, 40, 255], index * 4);
      },
    );

    // sqrt(40² + 40²) = 56.6, beyond 48 only when green and blue both count.
    expect(
      analyzeMask(ring, WIDTH, HEIGHT, pixels)!.mask[50 * WIDTH + 60],
    ).toBe(1);
  });

  it('fills a large hole when the object covers the whole border, leaving no background to compare with', () => {
    const frame = new Uint8Array(7 * 7).fill(255);
    for (let y = 2; y < 5; y += 1) frame.fill(0, y * 7 + 2, y * 7 + 5);

    const { mask } = analyzeMask(frame, 7, 7)!;

    expect(count(mask)).toBe(49);
  });

  // Each notch touches exactly one edge, so only that edge's seeds can tell it from a hole.
  // Plain it() in a loop, not it.each: Stryker's per-test filter never matches an it.each title.
  for (const [edge, x, y] of [
    ['top', 2, 0],
    ['bottom', 2, 4],
    ['left', 0, 2],
    ['right', 4, 3],
  ] as const) {
    it(`leaves a notch reaching only the ${edge} edge open, but fills a hole`, () => {
      const alpha = new Uint8Array(5 * 5).fill(255);
      alpha[y * 5 + x] = 0;
      alpha[2 * 5 + 2] = 0;

      const { mask } = analyzeMask(alpha, 5, 5)!;

      expect(mask[y * 5 + x]).toBe(0);
      expect(mask[2 * 5 + 2]).toBe(1);
    });
  }

  // On a grey table, so every channel's mean is a real average, not a sum of zeros.
  for (const [name, channel] of [
    ['red', 0],
    ['green', 1],
    ['blue', 2],
  ] as const) {
    it(`judges the ${name} channel by its exact mean: 48 from the table stays open, 49 is filled`, () => {
      const ring = alphaWhere((x, y) => {
        const distance = Math.hypot(x - 60, y - 50);
        return distance <= 40 && distance > 25;
      });
      const centre = alphaWhere((x, y) => Math.hypot(x - 60, y - 50) <= 25);
      const photo = (shift: number) => {
        const pixels = new Uint8Array(WIDTH * HEIGHT * 4).fill(100);
        centre.forEach((inside, index) => {
          if (inside) pixels[index * 4 + channel] = 100 + shift;
        });
        return pixels;
      };

      expect(
        analyzeMask(ring, WIDTH, HEIGHT, photo(48))!.mask[50 * WIDTH + 60],
      ).toBe(0);
      expect(
        analyzeMask(ring, WIDTH, HEIGHT, photo(49))!.mask[50 * WIDTH + 60],
      ).toBe(1);
    });
  }

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

  it('gives a bottom-left corner only right and above', () => {
    expect(edgeNeighbours(6, 3, 9)).toEqual([7, 3]);
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

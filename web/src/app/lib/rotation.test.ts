import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  fitFor,
  isUnturned,
  MAX_FREE_ANGLE,
  NO_ROTATION,
  previewLayout,
  rotatedSize,
  rotationMatrix,
  totalDegrees,
  turnedBy,
  turnOf,
  withAngle,
} from './rotation';

const LANDSCAPE = { width: 1000, height: 750 };

/** Where `matrix` sends the point (x, y), as a canvas's setTransform would. */
function apply(
  [a, b, c, d, e, f]: ReturnType<typeof rotationMatrix>,
  x: number,
  y: number,
) {
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}

describe('fitFor', () => {
  it('keeps a cut-out whole and crops an opaque photo', () => {
    expect(fitFor(true)).toBe('whole');
    expect(fitFor(false)).toBe('crop');
  });
});

describe('turnedBy', () => {
  it('counts quarter turns round to four and back, keeping the free angle', () => {
    const tilted = { quarterTurns: 0, angle: 3 };
    expect(turnedBy(tilted, 1)).toEqual({ quarterTurns: 1, angle: 3 });
    expect(turnedBy(tilted, -1)).toEqual({ quarterTurns: 3, angle: 3 });
    expect(turnedBy({ quarterTurns: 3, angle: 0 }, 1)).toEqual(NO_ROTATION);
  });
});

describe('withAngle', () => {
  it('sets the free angle and keeps the quarter turns', () => {
    expect(withAngle({ quarterTurns: 2, angle: 0 }, -12.5)).toEqual({
      quarterTurns: 2,
      angle: -12.5,
    });
  });

  it('holds the angle within the slider’s range', () => {
    expect(withAngle(NO_ROTATION, 60).angle).toBe(MAX_FREE_ANGLE);
    expect(withAngle(NO_ROTATION, -60).angle).toBe(-MAX_FREE_ANGLE);
  });
});

describe('totalDegrees and isUnturned', () => {
  it('adds the quarter turns and the free angle into one turn', () => {
    expect(totalDegrees({ quarterTurns: 3, angle: -2.5 })).toBe(267.5);
  });

  it('treats only a whole number of full turns as nothing to save', () => {
    expect(isUnturned(NO_ROTATION)).toBe(true);
    expect(isUnturned({ quarterTurns: 1, angle: 0 })).toBe(false);
    expect(isUnturned({ quarterTurns: 0, angle: 0.1 })).toBe(false);
  });
});

describe('turnOf', () => {
  it('is exact on every quarter turn, either way round', () => {
    expect(turnOf(0)).toEqual({ cos: 1, sin: 0 });
    expect(turnOf(90)).toEqual({ cos: 0, sin: 1 });
    expect(turnOf(180)).toEqual({ cos: -1, sin: 0 });
    expect(turnOf(270)).toEqual({ cos: 0, sin: -1 });
    expect(turnOf(-90)).toEqual({ cos: 0, sin: -1 });
    expect(turnOf(450)).toEqual({ cos: 0, sin: 1 });
  });

  it('follows the trigonometry between them', () => {
    expect(turnOf(30).cos).toBeCloseTo(Math.sqrt(3) / 2, 12);
    expect(turnOf(30).sin).toBeCloseTo(0.5, 12);
  });
});

describe('rotatedSize', () => {
  it('swaps the sides on a quarter turn, whole or cropped', () => {
    for (const fit of ['whole', 'crop'] as const) {
      expect(rotatedSize(LANDSCAPE, { degrees: 90, fit })).toEqual({
        width: 750,
        height: 1000,
      });
      expect(rotatedSize(LANDSCAPE, { degrees: 180, fit })).toEqual(LANDSCAPE);
      expect(rotatedSize(LANDSCAPE, { degrees: 0, fit })).toEqual(LANDSCAPE);
    }
  });

  it('grows the canvas to the turned photo’s bounds when kept whole', () => {
    // 1000·cos30 + 750·sin30 = 1241.03; 1000·sin30 + 750·cos30 = 1149.52
    expect(rotatedSize(LANDSCAPE, { degrees: 30, fit: 'whole' })).toEqual({
      width: 1242,
      height: 1150,
    });
  });

  it('crops to the largest upright rectangle, two sides touching', () => {
    // (1000·cos10 − 750·sin10) / cos20 = 909.42; (750·cos10 − 1000·sin10) / cos20 = 601.24
    expect(rotatedSize(LANDSCAPE, { degrees: 10, fit: 'crop' })).toEqual({
      width: 909,
      height: 601,
    });
  });

  it('crops a long, thin photo to what half its short side reaches', () => {
    const strip = { width: 1000, height: 100 };
    // 50 / sin30 = 100, 50 / cos30 = 57.7
    expect(rotatedSize(strip, { degrees: 30, fit: 'crop' })).toEqual({
      width: 100,
      height: 57,
    });
    expect(
      rotatedSize({ width: 100, height: 1000 }, { degrees: 30, fit: 'crop' }),
    ).toEqual({ width: 57, height: 100 });
  });

  it('crops a square at 45° to the square inside its diamond', () => {
    expect(
      rotatedSize({ width: 100, height: 100 }, { degrees: 45, fit: 'crop' }),
    ).toEqual({ width: 70, height: 70 });
  });

  it('never crops to nothing', () => {
    expect(
      rotatedSize({ width: 1, height: 1 }, { degrees: 45, fit: 'crop' }),
    ).toEqual({ width: 1, height: 1 });
  });

  it('keeps the crop inside the turned photo, at every angle', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 3000 }),
        fc.integer({ min: 2, max: 3000 }),
        fc.double({ min: -45, max: 45, noNaN: true }),
        (width, height, degrees) => {
          const photo = { width, height };
          const canvas = rotatedSize(photo, { degrees, fit: 'crop' });
          // The canvas's corners, carried back into the photo, fall on it.
          const [a, b, c, d, e, f] = rotationMatrix(photo, {
            degrees,
            canvas,
          });
          for (const [x, y] of [
            [0, 0],
            [canvas.width, 0],
            [0, canvas.height],
            [canvas.width, canvas.height],
          ]) {
            // The inverse of a rotation is its transpose.
            const sourceX = a * (x - e) + b * (y - f);
            const sourceY = c * (x - e) + d * (y - f);
            expect(sourceX).toBeGreaterThanOrEqual(-1e-6);
            expect(sourceY).toBeGreaterThanOrEqual(-1e-6);
            expect(sourceX).toBeLessThanOrEqual(width + 1e-6);
            expect(sourceY).toBeLessThanOrEqual(height + 1e-6);
          }
        },
      ),
    );
  });
});

describe('rotationMatrix', () => {
  it('turns a photo clockwise a quarter: the top-left corner lands top right', () => {
    const canvas = { width: 750, height: 1000 };
    const matrix = rotationMatrix(LANDSCAPE, { degrees: 90, canvas });
    expect(matrix).toEqual([0, 1, -1, 0, 750, 0]);
    expect(apply(matrix, 0, 0)).toEqual({ x: 750, y: 0 });
    expect(apply(matrix, 1000, 750)).toEqual({ x: 0, y: 1000 });
  });

  it('turns it counter-clockwise a quarter: the top-left corner lands bottom left', () => {
    const canvas = { width: 750, height: 1000 };
    const matrix = rotationMatrix(LANDSCAPE, { degrees: -90, canvas });
    expect(apply(matrix, 0, 0)).toEqual({ x: 0, y: 1000 });
  });

  it('turns it upside down onto the same canvas', () => {
    const matrix = rotationMatrix(LANDSCAPE, {
      degrees: 180,
      canvas: LANDSCAPE,
    });
    expect(apply(matrix, 0, 0)).toEqual({ x: 1000, y: 750 });
  });

  it('keeps the photo’s centre on the canvas’s centre at a free angle', () => {
    const canvas = { width: 1242, height: 1150 };
    const centre = apply(
      rotationMatrix(LANDSCAPE, { degrees: 30, canvas }),
      500,
      375,
    );
    expect(centre.x).toBeCloseTo(621, 9);
    expect(centre.y).toBeCloseTo(575, 9);
  });

  it('turns a point right of the centre downwards for a positive angle', () => {
    const square = { width: 100, height: 100 };
    const point = apply(
      rotationMatrix(square, { degrees: 30, canvas: square }),
      100,
      50,
    );
    expect(point.x).toBeCloseTo(50 + 50 * Math.cos(Math.PI / 6), 9);
    expect(point.y).toBeCloseTo(50 + 50 * Math.sin(Math.PI / 6), 9);
  });
});

describe('previewLayout', () => {
  it('frames a quarter-turned photo as stored, the photo across its other side', () => {
    expect(
      previewLayout({ photo: LANDSCAPE, degrees: 90, fit: 'crop' }),
    ).toEqual({
      frame: { width: 750, height: 1000 },
      photoShare: { width: 1000 / 750, height: 750 / 1000 },
    });
  });

  it('frames an unturned photo exactly', () => {
    expect(
      previewLayout({ photo: LANDSCAPE, degrees: 0, fit: 'whole' }),
    ).toEqual({ frame: LANDSCAPE, photoShare: { width: 1, height: 1 } });
  });

  it('frames all of a cut-out turned at an angle, the photo inside it', () => {
    const { frame, photoShare } = previewLayout({
      photo: LANDSCAPE,
      degrees: 30,
      fit: 'whole',
    });
    expect(frame).toEqual({ width: 1242, height: 1150 });
    expect(photoShare.width).toBeCloseTo(1000 / 1242, 12);
    expect(photoShare.height).toBeCloseTo(750 / 1150, 12);
  });

  it('frames the crop of an opaque photo, the photo overflowing it', () => {
    const { photoShare } = previewLayout({
      photo: LANDSCAPE,
      degrees: 10,
      fit: 'crop',
    });
    expect(photoShare.width).toBeGreaterThan(1);
    expect(photoShare.height).toBeGreaterThan(1);
  });
});

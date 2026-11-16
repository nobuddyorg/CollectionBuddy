import { describe, expect, it } from 'vitest';

import {
  convexHull,
  isRectangular,
  MIN_RECTANGLE_FILL,
  minimumAreaRectangle,
  rowExtremes,
  straighteningFor,
  straighteningTurn,
  tiltOffAxis,
} from './straighten';

const SIZE = { width: 400, height: 400 };

/** An alpha mask, opaque (255) wherever `inside` holds for the pixel's centre. */
function maskOf(inside: (x: number, y: number) => boolean, size = SIZE) {
  const alpha = new Uint8ClampedArray(size.width * size.height);
  for (let y = 0; y < size.height; y += 1) {
    for (let x = 0; x < size.width; x += 1) {
      if (inside(x + 0.5, y + 0.5)) alpha[y * size.width + x] = 255;
    }
  }
  return alpha;
}

/** A rectangle of `width` × `height` round the mask's centre, its sides turned clockwise by `tilt` degrees. */
function tiltedRectangle(width: number, height: number, tilt: number) {
  const radians = (tilt * Math.PI) / 180;
  const [cos, sin] = [Math.cos(radians), Math.sin(radians)];
  return maskOf((x, y) => {
    const [dx, dy] = [x - 200, y - 200];
    const along = dx * cos + dy * sin;
    const across = -dx * sin + dy * cos;
    return Math.abs(along) <= width / 2 && Math.abs(across) <= height / 2;
  });
}

function turnFor(alpha: Uint8ClampedArray) {
  const straightening = straighteningTurn(alpha, SIZE);
  if (straightening.kind !== 'straighten') {
    throw new Error('Expected a suggestion');
  }
  return straightening.degrees;
}

describe('rowExtremes', () => {
  it('takes the outer corners of each row’s first and last opaque pixel', () => {
    // Row 0: pixels 1 and 3 opaque (2 a hole); row 1 empty.
    const alpha = [0, 200, 0, 128, 0, 0, 0, 0, 0, 0];
    expect(rowExtremes(alpha, { width: 5, height: 2 })).toEqual([
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 4, y: 0 },
      { x: 4, y: 1 },
    ]);
  });

  it('looks for a row’s last opaque pixel within that row, not in the next', () => {
    // Row 0: only pixel 1 opaque; row 1 entirely opaque.
    const alpha = [0, 255, 0, 0, 255, 255, 255, 255];
    expect(rowExtremes(alpha, { width: 4, height: 2 }).slice(0, 4)).toEqual([
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 0 },
      { x: 2, y: 1 },
    ]);
  });

  it('counts a pixel under the opacity threshold as background', () => {
    expect(rowExtremes([127, 127], { width: 2, height: 1 })).toEqual([]);
  });

  it('takes a lone opaque pixel at the end of a row as both ends', () => {
    expect(rowExtremes([0, 255], { width: 2, height: 1 })).toEqual([
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 0 },
      { x: 2, y: 1 },
    ]);
  });
});

describe('convexHull', () => {
  it('keeps only the corners, dropping inner and collinear points', () => {
    const hull = convexHull([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 2, y: 2 },
      { x: 0, y: 4 },
      { x: 0, y: 4 },
    ]);
    expect(hull).toHaveLength(4);
    expect(hull).toEqual(
      expect.arrayContaining([
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 4 },
        { x: 0, y: 4 },
      ]),
    );
  });

  it('starts from the leftmost point, the topmost of those, and goes round counter-clockwise with y up', () => {
    expect(
      convexHull([
        { x: 2, y: 0 },
        { x: 1, y: 2 },
        { x: 2, y: 2 },
        { x: 0, y: 2 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ]),
    ).toEqual([
      { x: 0, y: 1 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ]);
  });

  it('reduces collinear points to the two ends', () => {
    expect(
      convexHull([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
    ]);
  });

  it('hands two points back as they are, in order', () => {
    expect(
      convexHull([
        { x: 3, y: 1 },
        { x: 1, y: 1 },
      ]),
    ).toEqual([
      { x: 1, y: 1 },
      { x: 3, y: 1 },
    ]);
  });
});

describe('minimumAreaRectangle', () => {
  it('lies flush with an axis-aligned rectangle', () => {
    const rectangle = minimumAreaRectangle([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 4 },
      { x: 0, y: 4 },
    ]);
    expect(rectangle.area).toBeCloseTo(40, 9);
    expect(tiltOffAxis(rectangle.angle)).toBeCloseTo(0, 9);
  });

  it('finds a diamond’s own sides, not the box round it', () => {
    const rectangle = minimumAreaRectangle([
      { x: 5, y: 0 },
      { x: 10, y: 5 },
      { x: 5, y: 10 },
      { x: 0, y: 5 },
    ]);
    expect(rectangle.area).toBeCloseTo(50, 9);
    expect(Math.abs(tiltOffAxis(rectangle.angle))).toBeCloseTo(45, 9);
  });

  it('measures the polygon beyond the edge’s far end and either side of it', () => {
    // Flush with the slanted edge from (2, 0) to (4, 2), the polygon reaches back past its start.
    const rectangle = minimumAreaRectangle([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 4, y: 2 },
      { x: 0, y: 2 },
    ]);
    expect(rectangle.area).toBeCloseTo(8, 9);
  });
});

describe('tiltOffAxis', () => {
  it('folds an edge direction onto the nearest axis', () => {
    expect(tiltOffAxis(3)).toBeCloseTo(3, 9);
    expect(tiltOffAxis(-3)).toBeCloseTo(-3, 9);
    expect(tiltOffAxis(93)).toBeCloseTo(3, 9);
    expect(tiltOffAxis(-177)).toBeCloseTo(3, 9);
    expect(tiltOffAxis(60)).toBeCloseTo(-30, 9);
    expect(tiltOffAxis(45)).toBe(45);
    expect(tiltOffAxis(-45)).toBe(45);
  });
});

describe('isRectangular', () => {
  it('takes a fill from the threshold up as a rectangle, and anything under it not', () => {
    expect(isRectangular(1)).toBe(true);
    expect(isRectangular(MIN_RECTANGLE_FILL)).toBe(true);
    expect(isRectangular(MIN_RECTANGLE_FILL - 1e-9)).toBe(false);
    expect(isRectangular(Math.PI / 4)).toBe(false);
  });
});

describe('straighteningFor', () => {
  it('turns back by the tilt, to a tenth of a degree', () => {
    expect(straighteningFor(3.04)).toEqual({ kind: 'straighten', degrees: -3 });
    expect(straighteningFor(-2.46)).toEqual({
      kind: 'straighten',
      degrees: 2.5,
    });
  });

  it('offers half a degree, either way, and nothing under it', () => {
    expect(straighteningFor(0.5)).toEqual({
      kind: 'straighten',
      degrees: -0.5,
    });
    expect(straighteningFor(-0.5)).toEqual({
      kind: 'straighten',
      degrees: 0.5,
    });
    expect(straighteningFor(0.44)).toEqual({ kind: 'none' });
    expect(straighteningFor(0)).toEqual({ kind: 'none' });
  });
});

describe('straighteningTurn', () => {
  it.each([3, 7.5, 12, 30, 44, -3, -20])(
    'turns a rectangle tilted %s° back by as much, within a fraction of a degree',
    (tilt) => {
      expect(turnFor(tiltedRectangle(260, 160, tilt))).toBeCloseTo(-tilt, 0);
      expect(
        Math.abs(turnFor(tiltedRectangle(260, 160, tilt)) + tilt),
      ).toBeLessThan(0.3);
    },
  );

  it('squares a tilted square just as well', () => {
    expect(Math.abs(turnFor(tiltedRectangle(200, 200, 17)) + 17)).toBeLessThan(
      0.3,
    );
  });

  it('takes the smaller turn the other way for a tilt past 45°', () => {
    // 60° clockwise is 30° short of the next quarter: turn on by 30°, not back by 60°.
    expect(Math.abs(turnFor(tiltedRectangle(260, 160, 60)) - 30)).toBeLessThan(
      0.3,
    );
  });

  it('turns by a tilt’s tenth of a degree, not a whole one', () => {
    expect(turnFor(tiltedRectangle(300, 200, 2.4))).not.toBe(-2);
  });

  it('suggests nothing for a rectangle already square', () => {
    expect(straighteningTurn(tiltedRectangle(260, 160, 0), SIZE)).toEqual({
      kind: 'none',
    });
  });

  it('suggests nothing for a tilt under half a degree', () => {
    expect(straighteningTurn(tiltedRectangle(300, 200, 0.3), SIZE)).toEqual({
      kind: 'none',
    });
  });

  it('suggests nothing for a round coin', () => {
    const coin = maskOf((x, y) => Math.hypot(x - 200, y - 200) <= 150);
    expect(straighteningTurn(coin, SIZE)).toEqual({ kind: 'none' });
  });

  it('suggests nothing for an irregular figure', () => {
    // A star: five points, far from filling any rectangle round it.
    const star = maskOf((x, y) => {
      const radius = Math.hypot(x - 200, y - 200);
      const angle = Math.atan2(y - 200, x - 200);
      return radius <= 100 + 70 * Math.cos(5 * angle);
    });
    expect(straighteningTurn(star, SIZE)).toEqual({ kind: 'none' });
  });

  it('suggests nothing for an empty mask or a sliver too small for a hull', () => {
    expect(
      straighteningTurn(new Uint8ClampedArray(SIZE.width * SIZE.height), SIZE),
    ).toEqual({ kind: 'none' });
  });

  it('suggests a turn just at the fill a rectangle needs, not under it', () => {
    // A 45° diamond fills its own square exactly; with every fourth row emptied it fills 3/4.
    const full = tiltedRectangle(200, 200, 45);
    expect(straighteningTurn(full, SIZE)).toEqual({
      kind: 'straighten',
      degrees: -45,
    });
    const striped = full.map((value, index) =>
      Math.floor(index / SIZE.width) % 4 === 0 ? 0 : value,
    );
    expect(0.75).toBeLessThan(MIN_RECTANGLE_FILL);
    expect(straighteningTurn(striped, SIZE)).toEqual({ kind: 'none' });
  });
});

import { isOpaque } from './objectMask';
import type { Dimensions } from './photoDimensions';

export type Point = { x: number; y: number };

/** The turn, clockwise in degrees, that sets a cut-out's object square; `none` where its tilt means nothing. */
export type Straightening =
  { kind: 'straighten'; degrees: number } | { kind: 'none' };

/** How much of its tightest rectangle the object fills before that rectangle is its shape: a circle fills π/4. */
export const MIN_RECTANGLE_FILL = 0.9;

/** A smaller turn is nothing to do. */
const MIN_TILT = 0.5;

/** The corners of each row's outermost opaque pixels: every point the outline's convex hull can need. */
export function rowExtremes(
  alpha: ArrayLike<number>,
  { width, height }: Dimensions,
): Point[] {
  return Array.from({ length: height }, (_, y) => y).flatMap((y) => {
    const row = y * width;
    let left = 0;
    while (left < width && !isOpaque(alpha[row + left])) left += 1;
    if (left === width) return [];
    let right = width - 1;
    while (!isOpaque(alpha[row + right])) right -= 1;
    return [
      { x: left, y },
      { x: left, y: y + 1 },
      { x: right + 1, y },
      { x: right + 1, y: y + 1 },
    ];
  });
}

function cross(origin: Point, a: Point, b: Point): number {
  return (
    (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x)
  );
}

function halfHull(points: Point[]): Point[] {
  const hull: Point[] = [];
  for (const point of points) {
    while (
      hull.length >= 2 &&
      cross(hull[hull.length - 2], hull[hull.length - 1], point) <= 0
    ) {
      hull.pop();
    }
    hull.push(point);
  }
  hull.pop();
  return hull;
}

/** The convex hull, counter-clockwise with y pointing up, by Andrew's monotone chain, without collinear points. */
export function convexHull(points: Point[]): Point[] {
  const sorted = points.toSorted((a, b) => a.x - b.x || a.y - b.y);
  return [...halfHull(sorted), ...halfHull(sorted.toReversed())];
}

/** The tightest rectangle round a convex polygon: it lies flush with one of its edges (Freeman and Shapira). */
export function minimumAreaRectangle(hull: Point[]): {
  area: number;
  /** The flush edge's direction, clockwise from the x-axis, in degrees. */
  angle: number;
} {
  const flush = hull.map((start, index) => {
    const end = hull[(index + 1) % hull.length];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    const along = {
      x: (end.x - start.x) / length,
      y: (end.y - start.y) / length,
    };
    let [minAlong, maxAlong, across] = [0, 0, 0];
    for (const point of hull) {
      const dx = point.x - start.x;
      const dy = point.y - start.y;
      const projected = dx * along.x + dy * along.y;
      minAlong = Math.min(minAlong, projected);
      maxAlong = Math.max(maxAlong, projected);
      // Counter-clockwise, the whole hull lies on one side of each of its edges.
      across = Math.max(across, dy * along.x - dx * along.y);
    }
    return {
      area: (maxAlong - minAlong) * across,
      angle: (Math.atan2(along.y, along.x) * 180) / Math.PI,
    };
  });
  return flush.toSorted((a, b) => a.area - b.area)[0];
}

/** An edge's tilt off the nearest axis, in (-45, 45]: a rectangle looks the same a quarter turn on. */
export function tiltOffAxis(angle: number): number {
  const withinQuarter = ((angle % 90) + 90) % 90;
  return withinQuarter > 45 ? withinQuarter - 90 : withinQuarter;
}

/** Whether an object filling this share of its tightest rectangle is that rectangle, so its tilt means something. */
export function isRectangular(fill: number): boolean {
  return fill >= MIN_RECTANGLE_FILL;
}

/** The turn that undoes a tilt, to a tenth of a degree, unless that is too small to be worth doing. */
export function straighteningFor(tilt: number): Straightening {
  const degrees = Math.round(-tilt * 10) / 10;
  return Math.abs(degrees) >= MIN_TILT
    ? { kind: 'straighten', degrees }
    : { kind: 'none' };
}

/** The smallest turn that sets a cut-out's rectangular object square, from its alpha mask. */
export function straighteningTurn(
  alpha: Uint8ClampedArray,
  size: Dimensions,
): Straightening {
  const hull = convexHull(rowExtremes(alpha, size));
  if (hull.length === 0) return { kind: 'none' };
  const rectangle = minimumAreaRectangle(hull);
  const opaque = alpha.reduce(
    (count, value) => count + (isOpaque(value) ? 1 : 0),
    0,
  );
  return isRectangular(opaque / rectangle.area)
    ? straighteningFor(tiltOffAxis(rectangle.angle))
    : { kind: 'none' };
}

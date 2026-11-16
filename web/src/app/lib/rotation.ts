import type { Dimensions } from './photoDimensions';

/** A stored photo's turn, clockwise: whole quarter turns plus a free angle of at most ±`MAX_FREE_ANGLE` degrees. */
export type Rotation = { quarterTurns: number; angle: number };

export const NO_ROTATION: Rotation = { quarterTurns: 0, angle: 0 };

/** Past it a quarter turn the other way is the shorter way round. */
export const MAX_FREE_ANGLE = 45;

/** `whole` keeps every pixel, with transparent corners; `crop` keeps the largest upright rectangle inside. */
export type RotationFit = 'whole' | 'crop';

/** A cut-out is see-through around the object already, so its corners can be too; an opaque photo is cropped. */
export function fitFor(transparent: boolean): RotationFit {
  return transparent ? 'whole' : 'crop';
}

/** One more quarter turn, `1` clockwise or `-1` counter-clockwise, the free angle kept. */
export function turnedBy(rotation: Rotation, quarters: 1 | -1): Rotation {
  return {
    ...rotation,
    quarterTurns: (((rotation.quarterTurns + quarters) % 4) + 4) % 4,
  };
}

/** The free angle, held within ±`MAX_FREE_ANGLE`; the quarter turns kept. */
export function withAngle(rotation: Rotation, angle: number): Rotation {
  return {
    ...rotation,
    angle: Math.min(MAX_FREE_ANGLE, Math.max(-MAX_FREE_ANGLE, angle)),
  };
}

/** The one clockwise turn, in degrees, that quarter turns and free angle add up to. */
export function totalDegrees({ quarterTurns, angle }: Rotation): number {
  return quarterTurns * 90 + angle;
}

/** Whether saving it would change nothing. */
export function isUnturned(rotation: Rotation): boolean {
  return totalDegrees(rotation) === 0;
}

const QUARTER_TURNS = [
  { cos: 1, sin: 0 },
  { cos: 0, sin: 1 },
  { cos: -1, sin: 0 },
  { cos: 0, sin: -1 },
] as const;

/** Cosine and sine of a clockwise turn, exact on a quarter turn so its pixels move without resampling. */
export function turnOf(degrees: number): { cos: number; sin: number } {
  const quarters = degrees / 90;
  if (Number.isInteger(quarters)) {
    return QUARTER_TURNS[((quarters % 4) + 4) % 4];
  }
  const radians = (degrees * Math.PI) / 180;
  return { cos: Math.cos(radians), sin: Math.sin(radians) };
}

// A rounding error must not grow a canvas by a whole pixel.
const SLACK = 1e-9;

function wholeSize({ width, height }: Dimensions, degrees: number) {
  const cos = Math.abs(turnOf(degrees).cos);
  const sin = Math.abs(turnOf(degrees).sin);
  return {
    width: width * cos + height * sin,
    height: width * sin + height * cos,
  };
}

// The largest-area upright rectangle inside a turned one: half the short side reaches a corner, or two sides touch.
function croppedSize({ width, height }: Dimensions, degrees: number) {
  const cos = Math.abs(turnOf(degrees).cos);
  const sin = Math.abs(turnOf(degrees).sin);
  const widthIsLonger = width >= height;
  const long = widthIsLonger ? width : height;
  const short = widthIsLonger ? height : width;
  // At 45° the two meet: 2·sin·cos is exactly 1 there in floating point too.
  if (short <= 2 * sin * cos * long) {
    const half = short / 2;
    return widthIsLonger
      ? { width: half / sin, height: half / cos }
      : { width: half / cos, height: half / sin };
  }
  const cosOfDouble = cos * cos - sin * sin;
  return {
    width: (width * cos - height * sin) / cosOfDouble,
    height: (height * cos - width * sin) / cosOfDouble,
  };
}

/** The canvas a photo of `size` lands on once turned by `degrees`, as `fit` says. */
export function rotatedSize(
  size: Dimensions,
  { degrees, fit }: { degrees: number; fit: RotationFit },
): Dimensions {
  if (fit === 'whole') {
    const whole = wholeSize(size, degrees);
    return {
      width: Math.ceil(whole.width - SLACK),
      height: Math.ceil(whole.height - SLACK),
    };
  }
  const cropped = croppedSize(size, degrees);
  return {
    width: Math.max(1, Math.floor(cropped.width + SLACK)),
    height: Math.max(1, Math.floor(cropped.height + SLACK)),
  };
}

/** `setTransform`'s six numbers: the photo's centre onto the canvas's centre, turned clockwise by `degrees`. */
export function rotationMatrix(
  photo: Dimensions,
  { degrees, canvas }: { degrees: number; canvas: Dimensions },
): [number, number, number, number, number, number] {
  const { cos, sin } = turnOf(degrees);
  const halfWidth = photo.width / 2;
  const halfHeight = photo.height / 2;
  return [
    cos,
    sin,
    -sin,
    cos,
    canvas.width / 2 - (cos * halfWidth - sin * halfHeight),
    canvas.height / 2 - (sin * halfWidth + cos * halfHeight),
  ];
}

/** A live preview's proportions: the result as it will be stored, and the photo's share of it either way. */
export function previewLayout({
  photo,
  degrees,
  fit,
}: {
  photo: Dimensions;
  degrees: number;
  fit: RotationFit;
}): { frame: Dimensions; photoShare: Dimensions } {
  const frame = rotatedSize(photo, { degrees, fit });
  return {
    frame,
    photoShare: {
      width: photo.width / frame.width,
      height: photo.height / frame.height,
    },
  };
}

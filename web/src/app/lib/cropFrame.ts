import type { Box, Size } from './cutoutImage';

/** The grid's cover frame: a crop in it shows whole on the card. */
export const GRID_ASPECT = 4 / 3;

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

/** `bounds` grown by `margin` of its longer side all round, widened or heightened to `aspect`, and held inside the photo. */
export function objectFrame({
  bounds,
  size,
  margin,
  aspect = GRID_ASPECT,
}: {
  bounds: Box;
  size: Size;
  margin: number;
  aspect?: number;
}): Box {
  const pad = Math.round(Math.max(bounds.width, bounds.height) * margin);
  const padded = {
    width: bounds.width + 2 * pad,
    height: bounds.height + 2 * pad,
  };
  // Grown, never shrunk, to the aspect: the object and its margin stay in.
  const width = Math.min(
    size.width,
    Math.max(padded.width, Math.round(padded.height * aspect)),
  );
  const height = Math.min(
    size.height,
    Math.max(padded.height, Math.round(padded.width / aspect)),
  );
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  return {
    x: clamp(Math.round(centerX - width / 2), 0, size.width - width),
    y: clamp(Math.round(centerY - height / 2), 0, size.height - height),
    width,
    height,
  };
}

/** A crop keeping this share of both sides trims too little to be worth a re-encode. */
const MIN_TRIM = 0.02;

/** Whether `frame` keeps nearly all of the photo: cropping a crop again would otherwise nibble a pixel off each time. */
export function isFramedAlready(frame: Box, size: Size): boolean {
  return (
    frame.width >= size.width * (1 - MIN_TRIM) &&
    frame.height >= size.height * (1 - MIN_TRIM)
  );
}

/** The RGBA pixels inside `box`, which lies inside the photo, row by row. */
export function cropPixels({
  pixels,
  size,
  box,
}: {
  pixels: Uint8ClampedArray;
  size: Size;
  box: Box;
}): Uint8ClampedArray<ArrayBuffer> {
  const cropped = new Uint8ClampedArray(box.width * box.height * 4);
  Array.from({ length: box.height }, (_, row) => row).forEach((row) => {
    const start = ((box.y + row) * size.width + box.x) * 4;
    cropped.set(
      pixels.subarray(start, start + box.width * 4),
      row * box.width * 4,
    );
  });
  return cropped;
}

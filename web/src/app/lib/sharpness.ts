import type { Dimensions } from './photoDimensions';

/** The longest side a photo is judged at: the full-size derivative's, so blur that vanishes there is never flagged. */
export const SHARPNESS_SIZE = 1000;

/** A score below this reads as blurry; calibrated in docs/explanation/design-decisions.md. */
export const BLUR_THRESHOLD = 100;

const TILE = 64;

type Region = { left: number; top: number } & Dimensions;

/** Rec. 601 luma per pixel of RGBA bytes: what the eye reads as edges, colour aside. */
function luminance(rgba: Uint8ClampedArray, { width, height }: Dimensions) {
  return Float32Array.from({ length: width * height }, (_, pixel) => {
    const offset = pixel * 4;
    return (
      0.299 * rgba[offset] + 0.587 * rgba[offset + 1] + 0.114 * rgba[offset + 2]
    );
  });
}

/** The 4-neighbour Laplacian of each interior pixel in a region, counted from the first interior one. */
function laplaciansIn(gray: Float32Array, width: number, region: Region) {
  const values: number[] = [];
  for (let y = region.top + 1; y <= region.top + region.height; y += 1) {
    for (let x = region.left + 1; x <= region.left + region.width; x += 1) {
      const at = y * width + x;
      values.push(
        gray[at - width] +
          gray[at + width] +
          gray[at - 1] +
          gray[at + 1] -
          4 * gray[at],
      );
    }
  }
  return values;
}

function variance(values: readonly number[]) {
  const mean =
    values.reduce((total, value) => total + value, 0) / values.length;
  return (
    values.reduce((total, value) => total + (value - mean) ** 2, 0) /
    values.length
  );
}

/** Whole tiles of the interior; one region of all of it where not even one tile fits. */
function regionsOf(interior: Dimensions): Region[] {
  const tiles: Region[] = [];
  for (let top = 0; top + TILE <= interior.height; top += TILE) {
    for (let left = 0; left + TILE <= interior.width; left += TILE) {
      tiles.push({ left, top, width: TILE, height: TILE });
    }
  }
  return tiles.length > 0 ? tiles : [{ left: 0, top: 0, ...interior }];
}

/** The Laplacian's variance in the sharpest 64 px tile: a small sharp item on a plain table still reads as sharp. */
export function sharpnessScore(
  rgba: Uint8ClampedArray,
  size: Dimensions,
): number {
  // No interior pixel, nothing to judge.
  if (size.width < 3 || size.height < 3) return Number.POSITIVE_INFINITY;
  const gray = luminance(rgba, size);
  const interior = { width: size.width - 2, height: size.height - 2 };
  return Math.max(
    ...regionsOf(interior).map((region) =>
      variance(laplaciansIn(gray, size.width, region)),
    ),
  );
}

export function isBlurry(score: number): boolean {
  return score < BLUR_THRESHOLD;
}

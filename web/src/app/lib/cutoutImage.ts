import { fillEach } from './fillEach';
import { ellipseCoverage, isOpaque, type MaskAnalysis } from './objectMask';

export type Size = { width: number; height: number };
export type Box = Size & { x: number; y: number };

/** `ellipse` when the objects are one clean ellipse, a coin say; `mask` for every other shape. */
export type CutoutMode = 'ellipse' | 'mask';

/** Scaled down, never up, so the longer side is at most `maxSide`. */
export function fitWithin(size: Size, maxSide: number): Size {
  const scale = Math.min(1, maxSide / Math.max(size.width, size.height));
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}

/** Opaque inside, fading over one pixel either side of the edge: a stamp's perforation stays crisp but not jagged. */
function softEdge(mask: Uint8Array, size: Size): Uint8ClampedArray {
  // Only x can wrap into the next row; a row off the image reads undefined, which is not 1.
  const covered = (x: number, y: number) =>
    x >= 0 && x < size.width && mask[y * size.width + x] === 1;
  const cell = (x: number, y: number) => (covered(x, y) ? 1 : 0);
  const row = (x: number, y: number) =>
    cell(x - 1, y) + cell(x, y) + cell(x + 1, y);
  return fillEach(new Uint8ClampedArray(mask.length), (index) => {
    const x = index % size.width;
    const y = Math.floor(index / size.width);
    const hits = row(x, y - 1) + row(x, y) + row(x, y + 1);
    // Nine cells in the pixel's neighbourhood.
    return (hits * 255) / 9;
  });
}

/** The ellipse wherever it explains the objects, else their cleaned mask, opaque with a soft rim. */
export function cutoutAlpha({
  analysis,
  size,
  minFillRatio,
}: {
  analysis: MaskAnalysis;
  size: Size;
  minFillRatio: number;
}): { alpha: Uint8ClampedArray; mode: CutoutMode } {
  if (analysis.fillRatio >= minFillRatio) {
    return {
      alpha: ellipseCoverage(analysis.ellipse, size.width, size.height),
      mode: 'ellipse',
    };
  }
  return { alpha: softEdge(analysis.mask, size), mode: 'mask' };
}

/** The tightest box around every pixel with any opacity; an all-transparent alpha keeps the whole frame. */
export function opaqueBounds(alpha: ArrayLike<number>, size: Size): Box {
  let left = size.width;
  let top = size.height;
  let right = -1;
  let bottom = -1;
  for (let index = 0; index < alpha.length; index += 1) {
    if (alpha[index] === 0) continue;
    const x = index % size.width;
    const y = Math.floor(index / size.width);
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }
  if (right < 0) return { x: 0, y: 0, ...size };
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/** The mean colour of the opaque pixels around `source`, or its own where none is: what a rim pixel outside the object shows. */
function rimColour({
  pixels,
  alpha,
  width,
  source,
}: {
  pixels: ArrayLike<number>;
  alpha: ArrayLike<number>;
  width: number;
  source: number;
}): number[] {
  const x = source % width;
  const y = Math.floor(source / width);
  const sum = [0, 0, 0];
  let count = 0;
  // Columns clamped, so x never wraps into the next row; a row off the image reads undefined, which is not opaque.
  const right = Math.min(width - 1, x + 1);
  for (let row = y - 1; row <= y + 1; row += 1) {
    for (let column = Math.max(0, x - 1); column <= right; column += 1) {
      const neighbour = row * width + column;
      if (!isOpaque(alpha[neighbour])) continue;
      sum[0] += pixels[neighbour * 4];
      sum[1] += pixels[neighbour * 4 + 1];
      sum[2] += pixels[neighbour * 4 + 2];
      count += 1;
    }
  }
  if (count === 0) {
    return [0, 1, 2].map((channel) => pixels[source * 4 + channel]);
  }
  return sum.map((total) => total / count);
}

/** The original photo's colours inside `box`, with `alpha` as their opacity; the soft rim outside the object takes the object's colour, not the background's. */
export function cropWithAlpha({
  pixels,
  alpha,
  width,
  box,
}: {
  pixels: ArrayLike<number>;
  alpha: ArrayLike<number>;
  width: number;
  box: Box;
}): Uint8ClampedArray<ArrayBuffer> {
  const length = box.width * box.height * 4;
  return Uint8ClampedArray.from({ length }, (_, index) => {
    const pixel = Math.floor(index / 4);
    const channel = index % 4;
    const row = box.y + Math.floor(pixel / box.width);
    const source = row * width + box.x + (pixel % box.width);
    const value = pixels[source * 4 + channel];
    // Never more opaque than the photo already was.
    if (channel === 3) return Math.min(value, alpha[source]);
    if (alpha[source] === 0 || isOpaque(alpha[source])) return value;
    return rimColour({ pixels, alpha, width, source })[channel];
  });
}

import {
  ellipseCoverage,
  FOREGROUND_ALPHA,
  isOpaque,
  type MaskAnalysis,
} from './coinMask';

export type Size = { width: number; height: number };
export type Box = Size & { x: number; y: number };

/** `ellipse` when the model's blob is a clean ellipse, `mask` when it is too irregular to trust the fit. */
export type CutoutMode = 'ellipse' | 'mask';

/** Scaled down, never up, so the longer side is at most `maxSide`. */
export function fitWithin(size: Size, maxSide: number): Size {
  const scale = Math.min(1, maxSide / Math.max(size.width, size.height));
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}

/** The ellipse wherever it explains the blob, else the model's own edge inside the cleaned mask. */
export function cutoutAlpha({
  analysis,
  modelAlpha,
  size,
  minFillRatio,
}: {
  analysis: MaskAnalysis;
  modelAlpha: ArrayLike<number>;
  size: Size;
  minFillRatio: number;
}): { alpha: Uint8ClampedArray; mode: CutoutMode } {
  if (analysis.fillRatio >= minFillRatio) {
    return {
      alpha: ellipseCoverage(analysis.ellipse, size.width, size.height),
      mode: 'ellipse',
    };
  }
  const alpha = Uint8ClampedArray.from(analysis.mask, (inside, index) => {
    if (!inside) return 0;
    const model = modelAlpha[index];
    // A filled hole is opaque; the rim's 128-255 fades from 0 so the edge stays soft.
    if (!isOpaque(model)) return 255;
    return (model - FOREGROUND_ALPHA) * 2 + 1;
  });
  return { alpha, mode: 'mask' };
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

/** The original photo's own colours inside `box`, with `alpha` as their opacity. */
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
    return channel === 3 ? Math.min(value, alpha[source]) : value;
  });
}

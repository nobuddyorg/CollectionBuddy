import { cropPixels } from './cropFrame';
import { ownTransparency, type Box } from './cutoutImage';
import { pixelBox } from './manualCropFrame';
import type { Dimensions } from './photoDimensions';
import {
  contextFor,
  offscreen,
  pixelsOf,
  withBitmap,
  type ContextOfSize,
  type Drawing,
} from './rotationJob';

/** Crops a stored photo to a frame drawn by hand, in photo pixels, in the one photo worker. */
export type FrameCropRequest = { kind: 'crop-frame'; file: Blob; box: Box };

/** The crop, losslessly as PNG: the upload compresses it once, as every photo is. */
export type FrameCrop = { blob: Blob; transparent: boolean };

export type FrameCropAnswer = FrameCrop | { error: string };

/** The photo's pixels inside `box`, on a canvas of their own; see-through where the photo was, so a cut-out's crop stays one. */
export function drawFramed<Context extends Drawing>(
  photo: CanvasImageSource & Dimensions,
  { box, contextOfSize }: { box: Box; contextOfSize: ContextOfSize<Context> },
): { canvas: Context['canvas']; transparent: boolean } {
  const size = { width: photo.width, height: photo.height };
  const inside = pixelBox(box, size);
  const pixels = cropPixels({
    pixels: pixelsOf(photo, contextOfSize),
    size,
    box: inside,
  });
  const drawing = contextFor(inside, contextOfSize);
  drawing.putImageData(
    new ImageData(pixels, inside.width, inside.height),
    0,
    0,
  );
  return {
    canvas: drawing.canvas,
    transparent: ownTransparency(pixels) !== null,
  };
}

/** The photo worker's crop, on an OffscreenCanvas. */
export function cropFrameOffscreen(
  request: FrameCropRequest,
): Promise<FrameCrop> {
  return withBitmap(request.file, async (bitmap) => {
    const { canvas, transparent } = drawFramed(bitmap, {
      box: request.box,
      contextOfSize: offscreen,
    });
    return {
      blob: await canvas.convertToBlob({ type: 'image/png' }),
      transparent,
    };
  });
}

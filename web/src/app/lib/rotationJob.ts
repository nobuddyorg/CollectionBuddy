import { ownTransparency } from './cutoutImage';
import type { Dimensions } from './photoDimensions';
import { fitFor, rotatedSize, rotationMatrix } from './rotation';
import { straighteningTurn, type Straightening } from './straighten';

/** Turns a stored photo clockwise by `degrees`, in the one photo worker. */
export type RotationRequest = { kind: 'rotate'; file: Blob; degrees: number };

/** Reads what a stored photo's rotation needs to know before anything is turned. */
export type InspectionRequest = { kind: 'inspect-rotation'; file: Blob };

/** A cut-out keeps its corners see-through; only a cut-out's outline can suggest a straightening. */
export type PhotoInspection = {
  transparent: boolean;
  straightening: Straightening;
};

/** The turned photo, losslessly as PNG: the upload compresses it once, as every photo is. */
export type Rotated = { blob: Blob; transparent: boolean };

export type RotationAnswer = Rotated | { error: string };
export type InspectionAnswer =
  { inspection: PhotoInspection } | { error: string };

type Drawing = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Makes a 2D context of a size, on whichever canvas the thread has. */
export type ContextOfSize<Context extends Drawing> = (
  size: Dimensions,
) => Context | null;

function contextFor<Context extends Drawing>(
  size: Dimensions,
  contextOfSize: ContextOfSize<Context>,
): Context {
  const drawing = contextOfSize(size);
  if (!drawing) throw new Error('This browser has no 2D canvas to draw on');
  return drawing;
}

/** The decoded photo's RGBA pixels at its own size. */
export function pixelsOf<Context extends Drawing>(
  photo: CanvasImageSource & Dimensions,
  contextOfSize: ContextOfSize<Context>,
): Uint8ClampedArray {
  const { width, height } = photo;
  const drawing = contextFor({ width, height }, contextOfSize);
  drawing.drawImage(photo, 0, 0);
  return drawing.getImageData(0, 0, width, height).data;
}

/** Whether a photo is a cut-out, and the turn its outline suggests. */
export function inspectPixels(
  pixels: Uint8ClampedArray,
  size: Dimensions,
): PhotoInspection {
  const alpha = ownTransparency(pixels);
  if (alpha === null) {
    return { transparent: false, straightening: { kind: 'none' } };
  }
  return { transparent: true, straightening: straighteningTurn(alpha, size) };
}

/** The photo drawn turned on a canvas of the size its fit calls for, and that canvas. */
export function drawRotated<Context extends Drawing>(
  photo: CanvasImageSource & Dimensions,
  {
    degrees,
    transparent,
    contextOfSize,
  }: {
    degrees: number;
    transparent: boolean;
    contextOfSize: ContextOfSize<Context>;
  },
): Context['canvas'] {
  const canvas = rotatedSize(photo, { degrees, fit: fitFor(transparent) });
  const drawing = contextFor(canvas, contextOfSize);
  drawing.imageSmoothingQuality = 'high';
  drawing.setTransform(...rotationMatrix(photo, { degrees, canvas }));
  drawing.drawImage(photo, 0, 0);
  return drawing.canvas;
}

const offscreen: ContextOfSize<OffscreenCanvasRenderingContext2D> = ({
  width,
  height,
}) =>
  new OffscreenCanvas(width, height).getContext('2d', {
    willReadFrequently: true,
  });

// Upright as EXIF says, as the compression decodes it: the turn is on top of what the viewer shows.
async function withBitmap<Result>(
  file: Blob,
  work: (bitmap: ImageBitmap) => Result | Promise<Result>,
): Promise<Result> {
  const bitmap = await createImageBitmap(file);
  try {
    return await work(bitmap);
  } finally {
    bitmap.close();
  }
}

/** The photo worker's inspection, on an OffscreenCanvas. */
export function inspectOffscreen(
  request: InspectionRequest,
): Promise<PhotoInspection> {
  return withBitmap(request.file, (bitmap) =>
    inspectPixels(pixelsOf(bitmap, offscreen), bitmap),
  );
}

/** The photo worker's rotation, on an OffscreenCanvas. */
export function rotateOffscreen(request: RotationRequest): Promise<Rotated> {
  return withBitmap(request.file, async (bitmap) => {
    const transparent = ownTransparency(pixelsOf(bitmap, offscreen)) !== null;
    const canvas = drawRotated(bitmap, {
      degrees: request.degrees,
      transparent,
      contextOfSize: offscreen,
    });
    return {
      blob: await canvas.convertToBlob({ type: 'image/png' }),
      transparent,
    };
  });
}

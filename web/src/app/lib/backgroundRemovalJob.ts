import { analyzeMask } from './objectMask';
import { fillEach } from './fillEach';
import {
  cropWithAlpha,
  cutoutAlpha,
  fitWithin,
  opaqueBounds,
  withMargin,
  type CutoutMode,
  type Size,
} from './cutoutImage';
import { loadModel, runModel } from './segmentationModel';
import { MODEL_SIZE, toAlphaMask, toModelInput } from './isnetTensor';

export type CutoutProgress =
  { stage: 'download'; loaded: number; total: number } | { stage: 'analyze' };

export type Cutout = {
  /** A transparent PNG, cropped to the object with a clear margin around it. */
  blob: Blob;
  width: number;
  height: number;
  /** `kept` for a photo that was a cut-out already: its own transparency is the outline, and the model never ran. */
  mode: CutoutMode | 'kept';
  /** How well one ellipse explains the objects; 0 when kept, where nothing was fitted. */
  fillRatio: number;
};

export type CutoutRequest =
  | {
      kind: 'cut-out';
      file: Blob;
      modelUrl: string;
      maxSide: number;
      minFillRatio: number;
      /** Clear space around the object, as a share of its longer side. */
      margin: number;
    }
  | { kind: 'preload'; modelUrl: string };

export type CutoutReply =
  | { kind: 'progress'; progress: CutoutProgress }
  | { kind: 'cut-out'; cutout: Cutout }
  | { kind: 'preloaded' }
  | { kind: 'no-object' }
  | { kind: 'failed'; message: string };

type Reply = (reply: CutoutReply) => void;

function drawPixels(source: ImageBitmap, size: Size): Uint8ClampedArray {
  const canvas = new OffscreenCanvas(size.width, size.height);
  const context = canvas.getContext('2d')!;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, size.width, size.height);
  return context.getImageData(0, 0, size.width, size.height).data;
}

// Orientation from EXIF, so a portrait phone photo is cut out upright.
async function decode(file: Blob, maxSide: number) {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: 'from-image',
  });
  try {
    const size = fitWithin(bitmap, maxSide);
    return {
      size,
      pixels: drawPixels(bitmap, size),
      modelPixels: drawPixels(bitmap, {
        width: MODEL_SIZE,
        height: MODEL_SIZE,
      }),
    };
  } finally {
    bitmap.close();
  }
}

function fetchModel(modelUrl: string, reply: Reply) {
  return loadModel(modelUrl, (loaded, total) =>
    reply({ kind: 'progress', progress: { stage: 'download', loaded, total } }),
  );
}

async function encodePng(pixels: Uint8ClampedArray<ArrayBuffer>, size: Size) {
  const canvas = new OffscreenCanvas(size.width, size.height);
  canvas
    .getContext('2d')!
    .putImageData(new ImageData(pixels, size.width, size.height), 0, 0);
  return canvas.convertToBlob({ type: 'image/png' });
}

type CutOutRequest = Extract<CutoutRequest, { kind: 'cut-out' }>;

/** The objects inside a clear margin, as a PNG: the one reply a cut-out ends with. */
async function framed(
  {
    pixels,
    alpha,
    size,
  }: { pixels: Uint8ClampedArray; alpha: ArrayLike<number>; size: Size },
  {
    margin,
    mode,
    fillRatio,
  }: { margin: number; mode: Cutout['mode']; fillRatio: number },
): Promise<CutoutReply> {
  const box = withMargin(opaqueBounds(alpha, size), margin);
  const cropped = cropWithAlpha({ pixels, alpha, size, box });
  return {
    kind: 'cut-out',
    cutout: {
      blob: await encodePng(cropped, box),
      width: box.width,
      height: box.height,
      mode,
      fillRatio,
    },
  };
}

/** The photo's own opacity, where it has a see-through pixel at all: then it is a cut-out already. */
function ownTransparency(pixels: Uint8ClampedArray): Uint8ClampedArray | null {
  const alpha = fillEach(
    new Uint8ClampedArray(pixels.length / 4),
    (index) => pixels[index * 4 + 3],
  );
  return alpha.includes(0) ? alpha : null;
}

async function cutOut(request: CutOutRequest, reply: Reply) {
  const { size, pixels, modelPixels } = await decode(
    request.file,
    request.maxSide,
  );
  // Cut out again, a cut-out only gains its margin: a second pass of the model would eat into its edge.
  const kept = ownTransparency(pixels);
  if (kept !== null) {
    reply(
      kept.some((value) => value > 0)
        ? await framed(
            { pixels, alpha: kept, size },
            { margin: request.margin, mode: 'kept', fillRatio: 0 },
          )
        : { kind: 'no-object' },
    );
    return;
  }
  const model = await fetchModel(request.modelUrl, reply);
  reply({ kind: 'progress', progress: { stage: 'analyze' } });
  const prediction = await runModel(model, toModelInput(modelPixels));
  const analysis = analyzeMask({
    alpha: toAlphaMask(prediction, size),
    pixels,
    width: size.width,
    height: size.height,
  });
  if (analysis === null) {
    reply({ kind: 'no-object' });
    return;
  }
  const { alpha, mode } = cutoutAlpha({
    analysis,
    size,
    minFillRatio: request.minFillRatio,
  });
  reply(
    await framed(
      { pixels, alpha, size },
      { margin: request.margin, mode, fillRatio: analysis.fillRatio },
    ),
  );
}

/** One request from the page, answered with progress and then exactly one final reply. */
export async function handleRequest(
  request: CutoutRequest,
  reply: Reply,
): Promise<void> {
  try {
    if (request.kind === 'preload') {
      await fetchModel(request.modelUrl, reply);
      reply({ kind: 'preloaded' });
      return;
    }
    await cutOut(request, reply);
  } catch (error: unknown) {
    reply({ kind: 'failed', message: String(error) });
  }
}

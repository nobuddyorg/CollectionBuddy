import { analyzeMask } from './coinMask';
import {
  cropWithAlpha,
  cutoutAlpha,
  fitWithin,
  opaqueBounds,
  type CutoutMode,
  type Size,
} from './coinCutoutImage';
import { loadModel, runModel } from './coinModel';
import { MODEL_SIZE, toAlphaMask, toModelInput } from './isnetTensor';

export type CutoutProgress =
  { stage: 'download'; loaded: number; total: number } | { stage: 'analyze' };

export type CoinCutout = {
  /** A transparent PNG, cropped to the coin. */
  blob: Blob;
  width: number;
  height: number;
  mode: CutoutMode;
  fillRatio: number;
};

export type CutoutRequest =
  | {
      kind: 'cut-out';
      file: Blob;
      modelUrl: string;
      maxSide: number;
      minFillRatio: number;
    }
  | { kind: 'preload'; modelUrl: string };

export type CutoutReply =
  | { kind: 'progress'; progress: CutoutProgress }
  | { kind: 'cut-out'; cutout: CoinCutout }
  | { kind: 'preloaded' }
  | { kind: 'no-coin' }
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

async function cutOut(
  request: Extract<CutoutRequest, { kind: 'cut-out' }>,
  reply: Reply,
) {
  const { size, pixels, modelPixels } = await decode(
    request.file,
    request.maxSide,
  );
  const model = await fetchModel(request.modelUrl, reply);
  reply({ kind: 'progress', progress: { stage: 'analyze' } });
  const prediction = await runModel(model, toModelInput(modelPixels));
  const modelAlpha = toAlphaMask(prediction, size);
  const analysis = analyzeMask(modelAlpha, size.width, size.height);
  if (analysis === null) {
    reply({ kind: 'no-coin' });
    return;
  }
  const { alpha, mode } = cutoutAlpha({
    analysis,
    modelAlpha,
    size,
    minFillRatio: request.minFillRatio,
  });
  const box = opaqueBounds(alpha, size);
  const cropped = cropWithAlpha({ pixels, alpha, width: size.width, box });
  reply({
    kind: 'cut-out',
    cutout: {
      blob: await encodePng(cropped, box),
      width: box.width,
      height: box.height,
      mode,
      fillRatio: analysis.fillRatio,
    },
  });
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

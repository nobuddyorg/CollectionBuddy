import { analyzeMask } from './objectMask';
import {
  cropWithAlpha,
  cutoutAlpha,
  fitWithin,
  opaqueBounds,
  ownTransparency,
  withMargin,
  type CutoutMode,
  type Size,
} from './cutoutImage';
import { cropPixels, isFramedAlready, objectFrame } from './cropFrame';
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

/** A stored photo cropped to its object, colours and opacity untouched, as PNG for the upload to compress once. */
export type Crop = {
  blob: Blob;
  width: number;
  height: number;
  /** A cut-out stays see-through; anything else is an opaque photo. */
  transparent: boolean;
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
  | {
      kind: 'crop-to-object';
      file: Blob;
      modelUrl: string;
      maxSide: number;
      /** Clear space around the object, as a share of its longer side. */
      margin: number;
    }
  | { kind: 'preload'; modelUrl: string };

export type CutoutReply =
  | { kind: 'progress'; progress: CutoutProgress }
  | { kind: 'cut-out'; cutout: Cutout }
  | { kind: 'cropped'; crop: Crop }
  | { kind: 'already-framed' }
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
type CropRequest = Extract<CutoutRequest, { kind: 'crop-to-object' }>;
type Decoded = Awaited<ReturnType<typeof decode>>;

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

/** The model's reading of the photo: its objects, cleaned up, or `null` where it found none. */
async function analyze(
  { size, pixels, modelPixels }: Decoded,
  { modelUrl, reply }: { modelUrl: string; reply: Reply },
) {
  const model = await fetchModel(modelUrl, reply);
  reply({ kind: 'progress', progress: { stage: 'analyze' } });
  const prediction = await runModel(model, toModelInput(modelPixels));
  return analyzeMask({
    alpha: toAlphaMask(prediction, size),
    pixels,
    width: size.width,
    height: size.height,
  });
}

/** Whether any pixel of a photo's own alpha shows something. */
const showsAnything = (alpha: Uint8Array | Uint8ClampedArray) =>
  alpha.some((value) => value > 0);

async function cutOut(request: CutOutRequest, reply: Reply) {
  const decoded = await decode(request.file, request.maxSide);
  const { size, pixels } = decoded;
  // Cut out again, a cut-out only gains its margin: a second pass of the model would eat into its edge.
  const kept = ownTransparency(pixels);
  if (kept !== null) {
    reply(
      showsAnything(kept)
        ? await framed(
            { pixels, alpha: kept, size },
            { margin: request.margin, mode: 'kept', fillRatio: 0 },
          )
        : { kind: 'no-object' },
    );
    return;
  }
  const analysis = await analyze(decoded, {
    modelUrl: request.modelUrl,
    reply,
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

async function cropToObject(request: CropRequest, reply: Reply) {
  const decoded = await decode(request.file, request.maxSide);
  const { size, pixels } = decoded;
  // A cut-out's own outline says where the object is; anything else asks the model.
  const kept = ownTransparency(pixels);
  const outline =
    kept ??
    (await analyze(decoded, { modelUrl: request.modelUrl, reply }))?.mask;
  if (outline === undefined || !showsAnything(outline)) {
    reply({ kind: 'no-object' });
    return;
  }
  const frame = objectFrame({
    bounds: opaqueBounds(outline, size),
    size,
    margin: request.margin,
  });
  if (isFramedAlready(frame, size)) {
    reply({ kind: 'already-framed' });
    return;
  }
  reply({
    kind: 'cropped',
    crop: {
      blob: await encodePng(cropPixels({ pixels, size, box: frame }), frame),
      width: frame.width,
      height: frame.height,
      transparent: kept !== null,
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
    if (request.kind === 'crop-to-object') {
      await cropToObject(request, reply);
      return;
    }
    await cutOut(request, reply);
  } catch (error: unknown) {
    reply({ kind: 'failed', message: String(error) });
  }
}

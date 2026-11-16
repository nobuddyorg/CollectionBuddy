import type { PhotoUpload } from '../data/photoType';
import { ownTransparency } from './cutoutImage';
import { askPhotoWorker, decodeUpright } from './photoWorkerClient';
import {
  drawRotated,
  inspectPixels,
  pixelsOf,
  type ContextOfSize,
  type InspectionAnswer,
  type PhotoInspection,
  type Rotated,
  type RotationAnswer,
} from './rotationJob';

export type { PhotoInspection };

const onMainThread: ContextOfSize<CanvasRenderingContext2D> = (size) =>
  Object.assign(document.createElement('canvas'), size).getContext('2d', {
    willReadFrequently: true,
  });

// Safari before 16.4 has no OffscreenCanvas, so a worker there could not draw.
const workerCanDraw = () => typeof OffscreenCanvas !== 'undefined';

async function inspectInWorker(file: Blob): Promise<PhotoInspection> {
  const answer = await askPhotoWorker<InspectionAnswer>(
    { kind: 'inspect-rotation', file },
    'The photo rotation worker failed',
  );
  if ('error' in answer) throw new Error(answer.error);
  return answer.inspection;
}

async function inspectOnMainThread(file: Blob): Promise<PhotoInspection> {
  const photo = await decodeUpright(file);
  return inspectPixels(pixelsOf(photo, onMainThread), photo);
}

/** Whether a stored photo is a cut-out, and the straightening its outline suggests. */
export function inspectForRotation(file: Blob): Promise<PhotoInspection> {
  return workerCanDraw() ? inspectInWorker(file) : inspectOnMainThread(file);
}

async function rotateInWorker(file: Blob, degrees: number): Promise<Rotated> {
  const answer = await askPhotoWorker<RotationAnswer>(
    { kind: 'rotate', file, degrees },
    'The photo rotation worker failed',
  );
  if ('error' in answer) throw new Error(answer.error);
  return answer;
}

async function rotateOnMainThread(
  file: Blob,
  degrees: number,
): Promise<Rotated> {
  const photo = await decodeUpright(file);
  const transparent = ownTransparency(pixelsOf(photo, onMainThread)) !== null;
  const canvas = drawRotated(photo, {
    degrees,
    transparent,
    contextOfSize: onMainThread,
  });
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (encoded) =>
        encoded
          ? resolve(encoded)
          : reject(new Error('The canvas encoded nothing')),
      'image/png',
    );
  });
  return { blob, transparent };
}

/** The photo turned clockwise by `degrees`, ready for the upload to compress once: a cut-out stays see-through. */
export async function rotatePhoto(
  file: Blob,
  degrees: number,
): Promise<PhotoUpload> {
  const { blob, transparent } = await (workerCanDraw()
    ? rotateInWorker(file, degrees)
    : rotateOnMainThread(file, degrees));
  return {
    file: new File([blob], 'rotated.png', { type: 'image/png' }),
    encoding: transparent ? 'transparent' : 'opaque',
  };
}

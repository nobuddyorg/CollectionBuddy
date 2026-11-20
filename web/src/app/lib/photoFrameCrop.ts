import type { PhotoUpload } from '../data/photoType';
import type { Box } from './cutoutImage';
import {
  drawFramed,
  type FrameCrop,
  type FrameCropAnswer,
} from './frameCropJob';
import {
  askPhotoWorker,
  decodeUpright,
  workerCanDraw,
} from './photoWorkerClient';

const onMainThread = (size: { width: number; height: number }) =>
  Object.assign(document.createElement('canvas'), size).getContext('2d', {
    willReadFrequently: true,
  });

async function cropInWorker(file: Blob, box: Box): Promise<FrameCrop> {
  const answer = await askPhotoWorker<FrameCropAnswer>(
    { kind: 'crop-frame', file, box },
    'The photo crop worker failed',
  );
  if ('error' in answer) throw new Error(answer.error);
  return answer;
}

async function cropOnMainThread(file: Blob, box: Box): Promise<FrameCrop> {
  const photo = await decodeUpright(file);
  const { canvas, transparent } = drawFramed(photo, {
    box,
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

/** The stored photo cut to `box`, in its own pixels, ready for the upload to compress once: a cut-out's crop stays see-through. */
export async function cropPhotoToFrame(
  file: Blob,
  box: Box,
): Promise<PhotoUpload> {
  const { blob, transparent } = await (workerCanDraw()
    ? cropInWorker(file, box)
    : cropOnMainThread(file, box));
  return {
    file: new File([blob], 'cropped.png', { type: 'image/png' }),
    encoding: transparent ? 'transparent' : 'opaque',
  };
}

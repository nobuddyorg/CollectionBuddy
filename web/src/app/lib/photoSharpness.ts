import { askPhotoWorker, decodeUpright } from './photoWorkerClient';
import { isBlurry } from './sharpness';
import { JUDGED_DRAWING, scoreOf, type SharpnessAnswer } from './sharpnessJob';
import { drawFitted } from './drawPhoto';

export type Sharpness = 'sharp' | 'blurry';

async function measureInWorker(file: Blob): Promise<number> {
  const answer = await askPhotoWorker<SharpnessAnswer>(
    { kind: 'sharpness', file },
    'The photo sharpness worker failed',
  );
  if ('error' in answer) throw new Error(answer.error);
  return answer.score;
}

async function measureOnMainThread(file: Blob): Promise<number> {
  const canvas = drawFitted(await decodeUpright(file), {
    ...JUDGED_DRAWING,
    contextOfSize: (size) =>
      Object.assign(document.createElement('canvas'), size).getContext('2d', {
        willReadFrequently: true,
      }),
  });
  return scoreOf(canvas.getContext('2d')!);
}

/** Whether a photo reads as blurry, judged in a worker wherever one can draw. */
export async function assessSharpness(file: Blob): Promise<Sharpness> {
  try {
    // Safari before 16.4 has no OffscreenCanvas, so a worker there could not draw.
    const score = await (typeof OffscreenCanvas === 'undefined'
      ? measureOnMainThread(file)
      : measureInWorker(file));
    return isBlurry(score) ? 'blurry' : 'sharp';
  } catch (error: unknown) {
    // Advisory only: a photo that cannot be judged goes on, and its upload reports a real decode failure.
    console.warn('Sharpness check failed:', error);
    return 'sharp';
  }
}

import type { CompressionRequest } from './drawPhoto';
import type { SharpnessRequest } from './sharpnessJob';

/** One request to a fresh photo worker, and the one answer it posts back; the worker ends with it. */
export function askPhotoWorker<Answer>(
  request: CompressionRequest | SharpnessRequest,
  failure: string,
): Promise<Answer> {
  // Turbopack passes a worker's chunks in its URL fragment, which Chrome reuses across workers of one bootstrap, so every photo job shares one entry.
  const worker = new Worker(new URL('./photo.worker.ts', import.meta.url), {
    type: 'module',
  });
  const answered = new Promise<Answer>((resolve, reject) => {
    worker.addEventListener('message', ({ data }: MessageEvent<Answer>) =>
      resolve(data),
    );
    worker.addEventListener('error', (event) => {
      reject(new Error(failure, { cause: event }));
    });
  });
  worker.postMessage(request);
  return answered.finally(() => worker.terminate());
}

function dataUrlOf(file: Blob): Promise<string> {
  const reader = new FileReader();
  return new Promise((resolve, reject) => {
    reader.addEventListener('load', () => resolve(reader.result as string));
    reader.addEventListener('error', () => {
      reject(
        new Error('The photograph could not be read', { cause: reader.error }),
      );
    });
    reader.readAsDataURL(file);
  });
}

/** Decoded on the main thread, upright: not createImageBitmap, which Safari 14 lacks and 15 ignores EXIF orientation in. */
export async function decodeUpright(file: Blob): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = await dataUrlOf(file);
  await image.decode();
  return image;
}

import { encodingFor } from '../data/photoType';
import type { CompressionAnswer } from './compressPhoto.worker';
import { type CompressionRequest, drawFitted } from './drawPhoto';

const QUALITY = 0.8;

let probedEncoding: Promise<string> | undefined;

// WebKit's canvas has no WebP encoder and answers a WebP request with PNG, ~10x the bytes (MDN browser-compat-data).
function probeWebpEncoding(): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob?.type ?? ''), 'image/webp');
  });
}

function compressInWorker(request: CompressionRequest): Promise<Blob> {
  const worker = new Worker(
    new URL('./compressPhoto.worker.ts', import.meta.url),
    { type: 'module' },
  );
  const answered = new Promise<Blob>((resolve, reject) => {
    worker.addEventListener(
      'message',
      ({ data }: MessageEvent<CompressionAnswer>) => {
        if ('blob' in data) resolve(data.blob);
        else reject(new Error(data.error));
      },
    );
    worker.addEventListener('error', (event) => {
      reject(
        new Error('The photo compression worker failed', { cause: event }),
      );
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

// Not createImageBitmap: Safari 14 lacks it and 15 ignores EXIF orientation there; img-src admits data:, not blob:.
async function decodeUpright(file: Blob): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = await dataUrlOf(file);
  await image.decode();
  return image;
}

async function compressOnMainThread(
  request: CompressionRequest,
): Promise<Blob> {
  const canvas = drawFitted(await decodeUpright(request.file), {
    ...request,
    contextOfSize: (size) =>
      Object.assign(document.createElement('canvas'), size).getContext('2d'),
  });
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('The canvas encoded nothing')),
      request.type,
      request.quality,
    );
  });
}

/** Every derivative: ~80% quality, as WebP where the browser encodes it and JPEG elsewhere, in a worker wherever one can draw. */
export async function compressPhoto(
  file: File,
  maxWidthOrHeight: number,
): Promise<File> {
  probedEncoding ??= probeWebpEncoding();
  const request: CompressionRequest = {
    file,
    maxWidthOrHeight,
    type: encodingFor(await probedEncoding),
    quality: QUALITY,
  };
  // Safari before 16.4 has no OffscreenCanvas, so a worker there could not draw.
  const blob = await (typeof OffscreenCanvas === 'undefined'
    ? compressOnMainThread(request)
    : compressInWorker(request));
  return new File([blob], file.name, { type: blob.type });
}

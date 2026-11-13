import { encodingFor, type PhotoEncoding } from '../data/photoType';
import { type CompressionRequest, drawFitted } from './drawPhoto';
import type { CompressionAnswer } from './photo.worker';
import { askPhotoWorker, decodeUpright } from './photoWorkerClient';

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

async function compressInWorker(request: CompressionRequest): Promise<Blob> {
  const answer = await askPhotoWorker<CompressionAnswer>(
    request,
    'The photo compression worker failed',
  );
  if ('error' in answer) throw new Error(answer.error);
  return answer.blob;
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

/** Every derivative: ~80% quality, as WebP where the browser encodes it and JPEG (PNG for a cut-out) elsewhere, in a worker wherever one can draw. */
export async function compressPhoto(
  file: File,
  {
    maxWidthOrHeight,
    encoding = 'opaque',
  }: { maxWidthOrHeight: number; encoding?: PhotoEncoding },
): Promise<File> {
  probedEncoding ??= probeWebpEncoding();
  const request: CompressionRequest = {
    kind: 'compress',
    file,
    maxWidthOrHeight,
    type: encodingFor(await probedEncoding, encoding),
    quality: QUALITY,
  };
  // Safari before 16.4 has no OffscreenCanvas, so a worker there could not draw.
  const blob = await (typeof OffscreenCanvas === 'undefined'
    ? compressOnMainThread(request)
    : compressInWorker(request));
  return new File([blob], file.name, { type: blob.type });
}

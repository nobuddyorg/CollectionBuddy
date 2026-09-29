import { type CompressionRequest, drawFitted } from './drawPhoto';

/** The worker's one answer: the encoded photograph, or why there is none. */
export type CompressionAnswer = { blob: Blob } | { error: string };

async function compress(request: CompressionRequest): Promise<Blob> {
  // Upright as EXIF says: every browser with OffscreenCanvas in workers (Safari from 16.4) applies it here.
  const bitmap = await createImageBitmap(request.file);
  try {
    const canvas = drawFitted(bitmap, {
      ...request,
      contextOfSize: ({ width, height }) =>
        new OffscreenCanvas(width, height).getContext('2d'),
    });
    return await canvas.convertToBlob({
      type: request.type,
      quality: request.quality,
    });
  } finally {
    bitmap.close();
  }
}

function answer(message: CompressionAnswer): void {
  self.postMessage(message);
}

self.addEventListener(
  'message',
  ({ data }: MessageEvent<CompressionRequest>) => {
    compress(data).then(
      (blob) => answer({ blob }),
      (error: unknown) => answer({ error: String(error) }),
    );
  },
);

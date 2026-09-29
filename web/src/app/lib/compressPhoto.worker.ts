import { type CompressionRequest, drawFitted } from './drawPhoto';

/** The worker's one answer: the encoded photograph, or why there is none. */
export type CompressionAnswer = { blob: Blob } | { error: string };

async function compress(request: CompressionRequest): Promise<Blob> {
  const canvas = await drawFitted(request, ({ width, height }) =>
    new OffscreenCanvas(width, height).getContext('2d'),
  );
  return canvas.convertToBlob({ type: request.type, quality: request.quality });
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

import { type CompressionRequest, drawFitted } from './drawPhoto';

/** The photograph decoded, fitted and encoded as asked, on an OffscreenCanvas: the photo worker's compression. */
export async function compressOffscreen(
  request: CompressionRequest,
): Promise<Blob> {
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

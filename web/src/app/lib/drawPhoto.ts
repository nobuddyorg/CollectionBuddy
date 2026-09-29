import { type Dimensions, fitWithin } from './photoDimensions';

/** One compression: the photograph, the longest side it may keep, and the encoding asked for. */
export type CompressionRequest = {
  file: Blob;
  maxWidthOrHeight: number;
  type: string;
  quality: number;
};

/** What a photograph needs of a 2D context, which a `<canvas>` and an OffscreenCanvas both offer. */
type PhotoContext = CanvasImageSmoothing &
  CanvasFillStrokeStyles &
  CanvasRect &
  CanvasDrawImage;

/** Decodes the photograph upright, as its EXIF orientation says, draws it fitted on the 2D context `contextOfSize` makes, and returns that context's canvas. */
export async function drawFitted<
  Context extends CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
>(
  { file, maxWidthOrHeight, type }: CompressionRequest,
  contextOfSize: (size: Dimensions) => Context | null,
): Promise<Context['canvas']> {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = fitWithin(bitmap, maxWidthOrHeight);
    const drawing = contextOfSize({ width, height });
    if (!drawing) throw new Error('This browser has no 2D canvas to draw on');
    const context: PhotoContext = drawing;
    context.imageSmoothingQuality = 'high';
    // JPEG has no alpha channel, and an encoder composites transparent pixels onto black.
    if (type === 'image/jpeg') {
      context.fillStyle = 'white';
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(bitmap, 0, 0, width, height);
    return drawing.canvas;
  } finally {
    bitmap.close();
  }
}

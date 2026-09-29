import { type Dimensions, fitWithin } from './photoDimensions';

/** One compression: the photograph, the longest side it may keep, and the encoding asked for. */
export type CompressionRequest = {
  /** Tells it apart from a cut-out in the one photo worker. */
  kind: 'compress';
  file: Blob;
  maxWidthOrHeight: number;
  type: string;
  quality: number;
};

/** Where a decoded photograph goes: within which longest side, for which encoding, on the 2D context `contextOfSize` makes. */
type DrawingTarget<Context> = Pick<
  CompressionRequest,
  'maxWidthOrHeight' | 'type'
> & { contextOfSize: (size: Dimensions) => Context | null };

/** Draws the decoded, upright photograph fitted on the 2D context the target makes, and returns that context's canvas. */
export function drawFitted<
  Context extends CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
>(
  photo: CanvasImageSource & Dimensions,
  { maxWidthOrHeight, type, contextOfSize }: DrawingTarget<Context>,
): Context['canvas'] {
  const { width, height } = fitWithin(photo, maxWidthOrHeight);
  const drawing = contextOfSize({ width, height });
  if (!drawing) throw new Error('This browser has no 2D canvas to draw on');
  drawing.imageSmoothingQuality = 'high';
  // JPEG has no alpha channel, and an encoder composites transparent pixels onto black.
  if (type === 'image/jpeg') {
    drawing.fillStyle = 'white';
    drawing.fillRect(0, 0, width, height);
  }
  drawing.drawImage(photo, 0, 0, width, height);
  return drawing.canvas;
}

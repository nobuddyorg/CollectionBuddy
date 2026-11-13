import { drawFitted } from './drawPhoto';
import { SHARPNESS_SIZE, sharpnessScore } from './sharpness';

/** One sharpness check: the photograph, judged at the full-size derivative's longest side. */
export type SharpnessRequest = {
  /** Tells it apart from a compression or a cut-out in the one photo worker. */
  kind: 'sharpness';
  file: Blob;
};

/** A sharpness check's one answer: the score, or why there is none. */
export type SharpnessAnswer = { score: number } | { error: string };

// Not JPEG: nothing is encoded here, and drawFitted paints a white backdrop for JPEG first.
export const JUDGED_DRAWING = {
  maxWidthOrHeight: SHARPNESS_SIZE,
  type: 'image/png',
} as const;

/** Scores what a canvas holds, read back through the context it was drawn on. */
export function scoreOf(
  drawing: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
): number {
  const { width, height } = drawing.canvas;
  return sharpnessScore(drawing.getImageData(0, 0, width, height).data, {
    width,
    height,
  });
}

/** The photo worker's half: decoded upright as EXIF says, drawn on an OffscreenCanvas, and scored. */
export async function measureOffscreen(
  request: SharpnessRequest,
): Promise<number> {
  const bitmap = await createImageBitmap(request.file);
  try {
    const canvas = drawFitted(bitmap, {
      ...JUDGED_DRAWING,
      contextOfSize: ({ width, height }) =>
        new OffscreenCanvas(width, height).getContext('2d', {
          willReadFrequently: true,
        }),
    });
    return scoreOf(canvas.getContext('2d')!);
  } finally {
    bitmap.close();
  }
}

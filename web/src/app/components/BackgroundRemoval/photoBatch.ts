/** The photos of one pick still to be reviewed, the one on screen first; `total` is how many the pick held. */
export type PhotoBatch = { itemId: string; files: File[]; total: number };

export type BatchPosition = { current: number; total: number };

/** Keeps the images in pick order and counts what was not one. */
export function splitImages(files: File[]): {
  images: File[];
  skipped: number;
} {
  const images = files.filter((file) => file.type.startsWith('image/'));
  return { images, skipped: files.length - images.length };
}

/** The batch without the photo just decided on; `null` after the last one. */
export function afterCurrent(batch: PhotoBatch): PhotoBatch | null {
  if (batch.files.length <= 1) return null;
  return { ...batch, files: batch.files.slice(1) };
}

/** Which photo of the pick is on screen, counted from 1. */
export function positionIn(batch: PhotoBatch): BatchPosition {
  return { current: batch.total - batch.files.length + 1, total: batch.total };
}

/** One after the other, in pick order: each upload decodes and re-encodes a photo, and the first in is the cover. */
export async function uploadInOrder(
  files: File[],
  uploadOne: (file: File) => Promise<void>,
): Promise<void> {
  for (const file of files) await uploadOne(file);
}

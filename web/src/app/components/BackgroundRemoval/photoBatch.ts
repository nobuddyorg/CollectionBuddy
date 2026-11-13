import type { Sharpness } from '../../lib/photoSharpness';

type BatchPosition = { current: number; total: number };

/** One picked photo waiting its turn; `sharpness` stays `checking` until its check answers. */
export type QueuedPhoto = {
  /** Unique within the session: a pick may hold the same file twice. */
  key: string;
  pick: number;
  itemId: string;
  file: File;
  removeBackground: boolean;
  position: BatchPosition;
  sharpness: Sharpness | 'checking';
};

export type PhotoPick = {
  pick: number;
  itemId: string;
  files: File[];
  removeBackground: boolean;
};

/** What the photo at the head of the queue needs now. */
export type NextStep = 'wait' | 'ask' | 'upload';

/** Keeps the images in pick order and counts what was not one. */
export function splitImages(files: File[]): {
  images: File[];
  skipped: number;
} {
  const images = files.filter((file) => file.type.startsWith('image/'));
  return { images, skipped: files.length - images.length };
}

/** The queue with a pick's photos after the ones already waiting, numbered within the pick. */
export function enqueuePick(
  queue: readonly QueuedPhoto[],
  { pick, itemId, files, removeBackground }: PhotoPick,
): QueuedPhoto[] {
  return [
    ...queue,
    ...files.map((file, index) => ({
      key: `${pick}:${index}`,
      pick,
      itemId,
      file,
      removeBackground,
      position: { current: index + 1, total: files.length },
      sharpness: 'checking' as const,
    })),
  ];
}

/** The queue without `photo`, provided it is still the one at the head. */
export function withoutHead(
  queue: readonly QueuedPhoto[],
  photo: QueuedPhoto,
): readonly QueuedPhoto[] {
  return queue[0]?.key === photo.key ? queue.slice(1) : queue;
}

/** The queue without what is left of a pick: closing the review ends that pick, not another one. */
export function withoutPick(
  queue: readonly QueuedPhoto[],
  pick: number,
): QueuedPhoto[] {
  return queue.filter((photo) => photo.pick !== pick);
}

/** The queue with `photo` judged, provided it is still waiting. */
export function judged(
  queue: readonly QueuedPhoto[],
  photo: QueuedPhoto,
  sharpness: Sharpness,
): QueuedPhoto[] {
  return queue.map((waiting) =>
    waiting.key === photo.key ? { ...waiting, sharpness } : waiting,
  );
}

/** A cut-out is always reviewed; otherwise only a blurry photo asks, and a sharp one goes straight up. */
export function nextStep(photo: QueuedPhoto): NextStep {
  if (photo.removeBackground || photo.sharpness === 'blurry') return 'ask';
  return photo.sharpness === 'sharp' ? 'upload' : 'wait';
}

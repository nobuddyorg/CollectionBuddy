import { describe, expect, it, vi } from 'vitest';

import { importCategory, PHOTO_UPLOAD_CONCURRENCY } from './importCategory';
import {
  type UploadImage,
  item,
  buildArchive,
  baseFakes,
} from './importCategory.test-support';

describe('importCategory, uploading through the pool', () => {
  it('uploads through a bounded pool, not one unbounded burst', async () => {
    const photoCount = PHOTO_UPLOAD_CONCURRENCY * 2;
    const photosByItemId = Object.fromEntries(
      Array.from({ length: photoCount }, (_, i) => [
        `item-${i}`,
        [new Uint8Array([i])],
      ]),
    );
    const items = Object.keys(photosByItemId).map((id) => item({ id }));
    const archive = await buildArchive({ items, photosByItemId });

    let inFlight = 0;
    let maxInFlight = 0;
    const release: (() => void)[] = [];
    const uploadImage = vi.fn(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise<void>((resolve) => release.push(resolve));
      inFlight--;
      return { error: null };
    }) as unknown as UploadImage;

    const promise = importCategory({
      file: archive,
      categoryName: 'Coins',
      ...baseFakes(),
      uploadImage,
    });

    await vi.waitFor(() =>
      expect(release.length).toBe(PHOTO_UPLOAD_CONCURRENCY),
    );
    expect(maxInFlight).toBe(PHOTO_UPLOAD_CONCURRENCY);

    // Two sequential uploadImage calls per photo (full, then thumbnail), so every call is drained.
    for (let released = 0; released < photoCount * 2; released++) {
      await vi.waitFor(() => expect(release.length).toBeGreaterThan(0));
      release.shift()!();
    }

    const result = await promise;
    expect(result.photoCount).toBe(photoCount);
    expect(maxInFlight).toBeLessThanOrEqual(PHOTO_UPLOAD_CONCURRENCY);
  });
});

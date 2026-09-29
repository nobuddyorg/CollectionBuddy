import { describe, expect, it, vi, type Mock } from 'vitest';

import { importCategory, PHOTO_UPLOAD_CONCURRENCY } from './importCategory';
import {
  type CreateImage,
  type UploadImage,
  archiveWithOnePhotoPerEntry,
  buildArchive,
  baseFakes,
} from './importCategory.test-support';

describe('importCategory, uploading through the pool', () => {
  it('uploads through a bounded pool, not one unbounded burst', async () => {
    const photoCount = PHOTO_UPLOAD_CONCURRENCY * 2;
    const archive = await archiveWithOnePhotoPerEntry(photoCount);

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

  // The cover is the oldest row, so a large first photograph finishing last must not lose its place.
  it('stamps each row in archive order, whatever order the uploads finish in', async () => {
    const cover = new Uint8Array([1, 1, 1, 1]);
    const detail = new Uint8Array([2]);
    const archive = await buildArchive({
      photosByItemId: { 'orig-item-1': [cover, detail] },
    });
    let releaseCover = () => {};
    const coverHeld = new Promise<void>((resolve) => (releaseCover = resolve));
    const uploadImage = vi.fn(async (_path: string, blob: Blob) => {
      if (blob.size === cover.length) await coverHeld;
      return { error: null };
    }) as unknown as UploadImage;
    const createImage = vi.fn(async (row: { size_bytes: number }) => {
      if (row.size_bytes === detail.length) releaseCover();
      return { data: null, error: null };
    }) as unknown as Mock<NonNullable<CreateImage>>;

    await importCategory({
      file: archive,
      ...baseFakes(),
      uploadImage,
      createImage,
    });

    const rows = createImage.mock.calls.map(
      ([row]) => row as { size_bytes: number; created_at: string },
    );
    expect(rows.map((row) => row.size_bytes)).toEqual([
      detail.length,
      cover.length,
    ]);
    expect(rows.map((row) => row.created_at)).toEqual([
      '2026-08-07T12:00:00.000Z',
      '2026-08-07T11:59:59.999Z',
    ]);
  });
});

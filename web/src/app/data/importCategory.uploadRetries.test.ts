import { describe, expect, it, vi } from 'vitest';

import { importCategory } from './importCategory';
import {
  type UploadImage,
  buildArchive,
  fakeCreateImage,
  baseFakes,
} from './importCategory.test-support';

describe('importCategory, retrying a photograph upload', () => {
  it('retries a failed photo upload before giving up and skipping it', async () => {
    let calls = 0;
    const uploadImage = vi.fn(async () => {
      calls++;
      return calls < 3 ? { error: new Error('flaky') } : { error: null };
    }) as unknown as UploadImage;
    const archive = await buildArchive();
    vi.useFakeTimers();
    try {
      const promise = importCategory({
        file: archive,
        categoryName: 'Coins',
        ...baseFakes(),
        uploadImage,
      });
      await vi.advanceTimersByTimeAsync(10_000);
      const result = await promise;
      expect(result.photoCount).toBe(1);
      expect(result.skippedPhotoCount).toBe(0);
      // 2 failures + 1 success for the full upload, then 1 more (fresh attempt counter) for the thumbnail.
      expect(calls).toBe(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('spaces retries with exponential backoff and gives up after exactly 3 attempts', async () => {
    let calls = 0;
    const uploadErrors: Error[] = [];
    const uploadImage = vi.fn(async () => {
      calls++;
      const error = new Error('storage down');
      uploadErrors.push(error);
      return { error };
    }) as unknown as UploadImage;
    const archive = await buildArchive();
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    vi.useFakeTimers();
    try {
      const promise = importCategory({
        file: archive,
        categoryName: 'Coins',
        ...baseFakes(),
        uploadImage,
      });

      // Attempt 0 fires immediately, with no delay beforehand.
      await vi.advanceTimersByTimeAsync(0);
      expect(calls).toBe(1);

      // Attempt 1 waits a 500ms base delay -- not before, not instantly.
      await vi.advanceTimersByTimeAsync(499);
      expect(calls).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(calls).toBe(2);

      // Attempt 2 waits double that (1000ms): exponential, not flat or decreasing.
      await vi.advanceTimersByTimeAsync(999);
      expect(calls).toBe(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(calls).toBe(3);

      // No 4th attempt: PHOTO_UPLOAD_ATTEMPTS is 3, not more.
      await vi.advanceTimersByTimeAsync(10_000);
      expect(calls).toBe(3);

      const result = await promise;
      expect(result.photoCount).toBe(0);
      expect(result.skippedPhotoCount).toBe(1);
      const loggedError = (consoleError.mock.calls[0] as unknown[])[2] as Error;
      expect(loggedError.message).toBe('Could not upload photograph');
      // The 3rd (final) attempt's own error, not the 1st or 2nd's.
      expect(loggedError.cause).toBe(uploadErrors[2]);
    } finally {
      vi.useRealTimers();
      consoleError.mockRestore();
    }
  });

  // A retry of the same path meets the object a failed attempt wrote: storage has no update policy.
  it('skips a photograph whose retry meets the object the failed attempt already wrote', async () => {
    const written = new Set<string>();
    const uploadImage = vi.fn(async (path: string) => {
      if (written.has(path)) return { error: new Error('Duplicate') };
      written.add(path);
      return { error: new Error('connection lost after the object landed') };
    }) as unknown as UploadImage;
    const createImage = fakeCreateImage();
    const archive = await buildArchive();
    vi.useFakeTimers();
    try {
      const promise = importCategory({
        file: archive,
        categoryName: 'Coins',
        ...baseFakes(),
        uploadImage,
        createImage,
      });
      await vi.advanceTimersByTimeAsync(10_000);
      const result = await promise;

      expect(result.itemCount).toBe(1);
      expect(result.photoCount).toBe(0);
      expect(result.skippedPhotoCount).toBe(1);
      // Three attempts at the full size and none at the thumbnail: the full size failing ends the photo.
      expect(uploadImage).toHaveBeenCalledTimes(3);
      expect([...written]).toEqual([
        expect.stringMatching(/^uid\/new-item-1\/[0-9a-f-]+\.webp$/),
      ]);
      expect(createImage).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('still counts the photograph a success when only its thumbnail fails to upload', async () => {
    const uploadImage = vi.fn(async (path: string) =>
      path.endsWith('.thumb.webp')
        ? { error: new Error('thumb storage down') }
        : { error: null },
    ) as unknown as UploadImage;
    const createImage = fakeCreateImage();
    const archive = await buildArchive();
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.useFakeTimers();
    try {
      const promise = importCategory({
        file: archive,
        categoryName: 'Coins',
        ...baseFakes(),
        uploadImage,
        createImage,
      });
      await vi.advanceTimersByTimeAsync(10_000);
      const result = await promise;
      expect(result.photoCount).toBe(1);
      expect(result.skippedPhotoCount).toBe(0);
      expect(consoleWarn).toHaveBeenCalledWith(
        'Thumbnail upload failed:',
        expect.any(Error),
      );
      // No usable thumbnail, so the row records none -- not the full photo's path standing in.
      expect(createImage).toHaveBeenCalledWith(
        expect.objectContaining({ path_thumb: null }),
      );
    } finally {
      vi.useRealTimers();
      consoleWarn.mockRestore();
    }
  });
});

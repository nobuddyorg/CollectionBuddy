import { describe, expect, it, vi } from 'vitest';

import { importCategory, type ImportProgress } from './importCategory';
import { EXPORT_FORMAT, EXPORT_FORMAT_VERSION } from './exportFormat';
import { createZipWriter } from './zip';
import {
  type CreateImage,
  item,
  buildArchive,
  fakeUploadImage,
  fakeCreateImage,
  fakeCompressThumb,
  baseFakes,
  NOW,
} from './importCategory.test-support';

// One manifest item with one photograph at `photoPath`, whose bytes the archive holds only if `bytes` has any.
function archiveWithOnePhoto(
  photoPath: string,
  bytes: Uint8Array<ArrayBuffer>[],
): Blob {
  const writer = createZipWriter();
  const encoder = new TextEncoder();
  const manifest = {
    format: EXPORT_FORMAT,
    version: EXPORT_FORMAT_VERSION,
    exported_at: '2026-08-06T00:00:00.000Z',
    category: { id: 'orig-cat-1', name: 'Coins' },
    items: [
      {
        ...item(),
        folder: '001-seated-dime',
        photos: [photoPath],
      },
    ],
  };
  writer.add({
    path: 'root/collection.json',
    bytes: encoder.encode(JSON.stringify(manifest)),
  });
  for (const photo of bytes) {
    writer.add({ path: `root/${photoPath}`, bytes: photo });
  }
  return writer.finish();
}

// A manifest item claiming a photo the archive never got, as a corrupt or hand-edited archive could.
function archiveMissingOnePhoto(): Blob {
  return archiveWithOnePhoto('photos/001-seated-dime/1.webp', []);
}

describe('importCategory, recreating the photographs', () => {
  it('uploads each photograph and a regenerated thumbnail under the new item id', async () => {
    const archive = await buildArchive({
      photosByItemId: { 'orig-item-1': [new Uint8Array([1, 2, 3])] },
    });
    const uploadImage = fakeUploadImage();
    const compressThumb = fakeCompressThumb();
    const createImage = fakeCreateImage();
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await importCategory({
      file: archive,
      categoryName: 'Coins',
      ...baseFakes(),
      uploadImage,
      compressThumb,
      createImage,
    });

    expect(result.photoCount).toBe(1);
    expect(result.skippedPhotoCount).toBe(0);
    expect(uploadImage).toHaveBeenCalledTimes(2); // full + thumb
    const [fullCall, thumbCall] = (uploadImage as ReturnType<typeof vi.fn>).mock
      .calls as [string, Blob][];
    const [fullPath, fullBlob] = fullCall;
    const [thumbPath, thumbBlob] = thumbCall;
    expect(fullPath).toMatch(/^uid\/new-item-1\/.+\.webp$/);
    expect(thumbPath).toMatch(/^uid\/new-item-1\/.+\.thumb\.webp$/);
    // The full upload carries the archive's own bytes and content type.
    expect(fullBlob.type).toBe('image/webp');
    expect(new Uint8Array(await fullBlob.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    // The thumbnail is whatever compressThumb produced, uploaded as-is.
    expect(await thumbBlob.text()).toBe('thumb');
    expect(compressThumb).toHaveBeenCalledTimes(1);
    // Recorded with the base name both uploads used, thumbnail path included since it succeeded.
    const base = fullPath.slice(0, -'.webp'.length);
    expect(createImage).toHaveBeenCalledWith({
      item_id: 'new-item-1',
      path_full: `${base}.webp`,
      path_thumb: `${base}.thumb.webp`,
      size_bytes: 3,
      created_at: NOW.toISOString(),
    });
    expect(consoleWarn).not.toHaveBeenCalled();
    consoleWarn.mockRestore();
  });

  // Safari's uploads are JPEG (no WebP encoder), so their export names them .jpg; the round trip keeps that type.
  it('stores each photograph as the type its archive name gives, and the thumbnail as encoded', async () => {
    const uploadImage = fakeUploadImage();
    const createImage = fakeCreateImage();
    const result = await importCategory({
      file: archiveWithOnePhoto('photos/001-seated-dime/1.jpg', [
        new Uint8Array([4, 5]),
      ]),
      categoryName: 'Coins',
      ...baseFakes(),
      uploadImage,
      createImage,
      compressThumb: async () => new Blob(['thumb'], { type: 'image/jpeg' }),
    });

    expect(result.photoCount).toBe(1);
    const [[fullPath, fullBlob], [thumbPath, thumbBlob]] = (
      uploadImage as ReturnType<typeof vi.fn>
    ).mock.calls as [string, Blob][];
    expect(fullPath).toMatch(/^uid\/new-item-1\/[0-9a-f-]+\.jpg$/);
    expect(fullBlob.type).toBe('image/jpeg');
    expect(thumbPath).toBe(fullPath.replace('.jpg', '.thumb.jpg'));
    expect(thumbBlob.type).toBe('image/jpeg');
    expect(createImage).toHaveBeenCalledWith(
      expect.objectContaining({ path_full: fullPath, path_thumb: thumbPath }),
    );
  });

  it('skips a photograph the bucket would refuse, before uploading anything', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const uploadImage = fakeUploadImage();

    const result = await importCategory({
      file: archiveWithOnePhoto('photos/001-seated-dime/1.gif', [
        new Uint8Array([6]),
      ]),
      categoryName: 'Coins',
      ...baseFakes(),
      uploadImage,
    });

    expect(result.skippedPhotoCount).toBe(1);
    expect(uploadImage).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      'Skipping photograph',
      'photos/001-seated-dime/1.gif',
      expect.objectContaining({
        message:
          'Not a photograph the bucket accepts: photos/001-seated-dime/1.gif',
      }),
    );
    consoleError.mockRestore();
  });

  it('skips a photograph missing from the archive rather than failing the import', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const progress: ImportProgress[] = [];

    const result = await importCategory({
      file: archiveMissingOnePhoto(),
      categoryName: 'Coins',
      ...baseFakes(),
      onProgress: (step) => progress.push(step),
    });

    expect(result.photoCount).toBe(0);
    expect(result.skippedPhotoCount).toBe(1);
    expect(consoleError).toHaveBeenCalledWith(
      'Photo missing from archive',
      'photos/001-seated-dime/1.webp',
    );
    // A missing photo still counts as "done" for the progress bar, not silently left out of the total.
    expect(progress[progress.length - 1]).toEqual({
      phase: 'photos',
      done: 1,
      total: 1,
    });
    consoleError.mockRestore();
  });

  it('does not require an onProgress callback to skip a missing photograph', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const result = await importCategory({
      file: archiveMissingOnePhoto(),
      categoryName: 'Coins',
      ...baseFakes(),
    });

    expect(result.skippedPhotoCount).toBe(1);
    consoleError.mockRestore();
  });

  it('skips a photograph whose uploads succeed but whose row cannot be recorded', async () => {
    const rowError = new Error('row insert failed');
    const createImage = vi.fn(async () => ({
      data: null,
      error: rowError,
    })) as unknown as CreateImage;
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
        createImage,
      });
      await vi.advanceTimersByTimeAsync(10_000);
      const result = await promise;
      expect(result.photoCount).toBe(0);
      expect(result.skippedPhotoCount).toBe(1);
      expect(consoleError).toHaveBeenCalledWith(
        'Skipping photograph',
        expect.any(String),
        expect.objectContaining({
          message: 'Could not record photograph',
          cause: rowError,
        }),
      );
    } finally {
      vi.useRealTimers();
      consoleError.mockRestore();
    }
  });
});

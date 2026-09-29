import { describe, expect, it, vi } from 'vitest';

import { importCategory, PHOTO_UPLOAD_CONCURRENCY } from './importCategory';
import {
  type CreateImage,
  archiveWithOnePhotoPerEntry,
  baseFakes,
  fakeUploadImage,
} from './importCategory.test-support';

const RECORDED = {
  data: { id: 'img-1', item_id: 'item', path_full: 'a', path_thumb: null },
  error: null,
};

// What 0025's tg_images_quota() sends through PostgREST: the owner's share, or with `details` the whole app.
type Refusal = {
  data: null;
  error: { code: string; details: string | null; message: string };
};
const OWNER_QUOTA: Refusal = {
  data: null,
  error: { code: 'PT507', details: null, message: 'photo storage quota' },
};
const APP_FULL: Refusal = {
  data: null,
  error: { code: 'PT507', details: 'project', message: 'storage is full' },
};

function refusingAfter(
  recorded: number,
  refusal: Refusal = OWNER_QUOTA,
): CreateImage {
  let calls = 0;
  return vi.fn(async () =>
    ++calls > recorded ? refusal : RECORDED,
  ) as unknown as CreateImage;
}

describe('importCategory, when the photo quota is reached', () => {
  it('stops uploading photographs once the quota refuses one, keeping what was imported', async () => {
    const archive = await archiveWithOnePhotoPerEntry(
      PHOTO_UPLOAD_CONCURRENCY * 2,
    );
    const fakes = baseFakes();
    const uploadImage = fakeUploadImage();
    const createImage = refusingAfter(0);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const result = await importCategory({
      file: archive,
      ...fakes,
      uploadImage,
      createImage,
    });

    // Only the photographs already in flight when the first was refused: none after it.
    expect(createImage).toHaveBeenCalledTimes(PHOTO_UPLOAD_CONCURRENCY);
    expect(uploadImage).toHaveBeenCalledTimes(PHOTO_UPLOAD_CONCURRENCY * 2);
    expect(result).toMatchObject({
      itemCount: PHOTO_UPLOAD_CONCURRENCY * 2,
      photoCount: 0,
      skippedPhotoCount: PHOTO_UPLOAD_CONCURRENCY * 2,
      photoQuotaReached: 'owner',
    });
    // A partial import, not a failed one: the category and its entries stay.
    expect(fakes.deleteCategoryRow).not.toHaveBeenCalled();
    expect(fakes.removeImages).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('counts the photographs recorded before the refusal as imported', async () => {
    const archive = await archiveWithOnePhotoPerEntry(
      PHOTO_UPLOAD_CONCURRENCY * 3,
    );

    const result = await importCategory({
      file: archive,
      ...baseFakes(),
      createImage: refusingAfter(PHOTO_UPLOAD_CONCURRENCY + 1),
    });

    expect(result.photoCount).toBe(PHOTO_UPLOAD_CONCURRENCY + 1);
    expect(result.skippedPhotoCount).toBe(PHOTO_UPLOAD_CONCURRENCY * 2 - 1);
    expect(result.photoQuotaReached).toBe('owner');
  });

  it("names the app's whole photo storage when that is what is full", async () => {
    const archive = await archiveWithOnePhotoPerEntry(2);

    const result = await importCategory({
      file: archive,
      ...baseFakes(),
      createImage: refusingAfter(1, APP_FULL),
    });

    expect(result.photoCount).toBe(1);
    expect(result.skippedPhotoCount).toBe(1);
    expect(result.photoQuotaReached).toBe('app');
  });

  it('reports no quota when every photograph was recorded', async () => {
    const archive = await archiveWithOnePhotoPerEntry(2);

    const result = await importCategory({
      file: archive,
      ...baseFakes(),
    });

    expect(result.photoQuotaReached).toBe('none');
    expect(result.skippedPhotoCount).toBe(0);
  });

  // Any other refusal of a row is one photograph's problem, not the rest's.
  it('keeps importing past a row refused for any other reason', async () => {
    const archive = await archiveWithOnePhotoPerEntry(
      PHOTO_UPLOAD_CONCURRENCY * 2,
    );
    const createImage = vi.fn(async () => ({
      data: null,
      error: { code: '42501', message: 'denied' },
    })) as unknown as CreateImage;
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const result = await importCategory({
      file: archive,
      ...baseFakes(),
      createImage,
    });

    expect(createImage).toHaveBeenCalledTimes(PHOTO_UPLOAD_CONCURRENCY * 2);
    expect(result.skippedPhotoCount).toBe(PHOTO_UPLOAD_CONCURRENCY * 2);
    expect(result.photoQuotaReached).toBe('none');
    consoleError.mockRestore();
  });
});

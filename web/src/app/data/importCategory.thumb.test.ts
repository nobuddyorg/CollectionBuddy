import { describe, expect, it, vi } from 'vitest';

import { importCategory } from './importCategory';
import {
  buildArchive,
  fakeCreateCategory,
  fakeCreateImage,
  fakeCreateItems,
  fakeDeleteCategory,
  fakeGetUserId,
  fakeUploadImage,
} from './importCategory.test-support';

// Every other importCategory test injects a thumbnailer; this file exercises the real default alone.
const compress = vi.fn(async () => new Blob(['thumb'], { type: 'image/webp' }));
vi.mock('../lib/imageCompression', () => ({
  compressPhoto: (...args: unknown[]) => compress(...(args as [])),
}));

const PHOTO = new Uint8Array([1, 2, 3]);

describe('importCategory with no thumbnailer injected', () => {
  it('makes the thumbnail with the app own compression settings', async () => {
    const result = await importCategory({
      file: await buildArchive({ photosByItemId: { 'orig-item-1': [PHOTO] } }),
      nameCategory: () => 'Coins',
      getUserId: fakeGetUserId('uid'),
      createCategoryRow: fakeCreateCategory(),
      deleteCategoryRow: fakeDeleteCategory(),
      createItemRows: fakeCreateItems(),
      uploadImage: fakeUploadImage(),
      createImage: fakeCreateImage(),
    });

    expect(result.photoCount).toBe(1);
    expect(compress).toHaveBeenCalledWith(expect.any(File), {
      maxWidthOrHeight: 600,
    });
    // The archive only carries the full size, so the thumbnail comes from the bytes in it.
    const [file] = compress.mock.calls[0] as unknown as [File];
    expect(file.type).toBe('image/webp');
    expect(file.name).toBe('photo.webp');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(PHOTO);
  });

  it('gives each new item a fresh random UUID and stamps it with the current time', async () => {
    const createItemRows = fakeCreateItems();
    const before = Date.now();
    await importCategory({
      file: await buildArchive({ photosByItemId: { 'orig-item-1': [PHOTO] } }),
      nameCategory: () => 'Coins',
      getUserId: fakeGetUserId('uid'),
      createCategoryRow: fakeCreateCategory(),
      deleteCategoryRow: fakeDeleteCategory(),
      createItemRows,
      uploadImage: fakeUploadImage(),
      createImage: fakeCreateImage(),
    });

    const [[, rows]] = createItemRows.mock.calls as [
      string,
      { id: string; created_at: string }[],
    ][];
    expect(rows[0].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    const stamped = Date.parse(rows[0].created_at);
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(Date.now());
  });
});

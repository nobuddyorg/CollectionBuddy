// @vitest-environment jsdom
import { act, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { verifiedUserId } from '../../data/auth';
import {
  createImageRow,
  listImagesForItems,
  uploadImageObject,
} from '../../data/images';
import {
  acceptsUploads,
  installDefaultImageMocks,
  renderItemImages,
  row,
} from './useItemImages.test-support';

vi.mock('../../data/auth', () => ({ verifiedUserId: vi.fn() }));

vi.mock('../../data/images', async () => {
  const actual =
    await vi.importActual<typeof import('../../data/images')>(
      '../../data/images',
    );
  return {
    ...actual,
    createImageRow: vi.fn(),
    createSignedUrls: vi.fn(),
    deleteImageRow: vi.fn(),
    listImagePathsForItems: vi.fn(),
    listImagesForItems: vi.fn(),
    removeImageObjects: vi.fn(),
    uploadImageObject: vi.fn(),
  };
});

// The real one probes a canvas and needs a Worker; this stand-in records the sizes asked for and encodes each as `encodedAs` says.
const compressions: number[] = [];
let encodedAs: Record<number, string> = {};
vi.mock('../../lib/imageCompression', () => ({
  compressPhoto: vi.fn(async (file: File, maxWidthOrHeight: number) => {
    compressions.push(maxWidthOrHeight);
    return new File([`compressed-${maxWidthOrHeight}`], file.name, {
      type: encodedAs[maxWidthOrHeight],
    });
  }),
}));

describe('useItemImages uploadImage', () => {
  beforeEach(() => {
    installDefaultImageMocks();
    compressions.length = 0;
    encodedAs = { 1000: 'image/webp', 600: 'image/webp' };
    acceptsUploads();
  });

  it('stores a full size and a thumbnail under the uploader own prefix, then records the row', async () => {
    const { result } = renderItemImages();

    await act(async () => {
      await result.current.uploadImage(
        'item-1',
        new File(['x'], 'photo.jpg', { type: 'image/jpeg' }),
      );
    });

    // The thumbnail is derived from the already-downscaled full size.
    expect(compressions).toEqual([1000, 600]);

    const paths = vi.mocked(uploadImageObject).mock.calls.map(([path]) => path);
    expect(paths[0]).toMatch(/^uid\/item-1\/[0-9a-f-]+\.webp$/);
    expect(paths[1]).toBe(paths[0]?.replace('.webp', '.thumb.webp'));
    expect(createImageRow).toHaveBeenCalledWith(
      expect.objectContaining({
        item_id: 'item-1',
        path_full: paths[0],
        path_thumb: paths[1],
      }),
    );
    expect(result.current.pendingUploads['item-1']).toBeUndefined();
    // The post-upload refresh lists exactly this item, not every item on the page or none at all.
    expect(listImagesForItems).toHaveBeenCalledWith(['item-1']);
  });

  // WebKit cannot encode WebP, so there the files are JPEG and named so: never a PNG under a .webp name.
  it('names each file after the type it was actually encoded as', async () => {
    encodedAs = { 1000: 'image/jpeg', 600: 'image/png' };
    const { result } = renderItemImages();

    await act(async () => {
      await result.current.uploadImage('item-1', new File(['x'], 'p.jpg'));
    });

    const [[pathFull, full], [pathThumb, thumbnail]] = vi.mocked(
      uploadImageObject,
    ).mock.calls as [string, File][];
    expect(pathFull).toMatch(/^uid\/item-1\/[0-9a-f-]+\.jpg$/);
    expect(full.type).toBe('image/jpeg');
    expect(pathThumb).toBe(pathFull.replace('.jpg', '.thumb.png'));
    expect(thumbnail.type).toBe('image/png');
  });

  it('uploads nothing encoded as a type the bucket refuses', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    encodedAs = { 1000: 'image/gif', 600: 'image/gif' };
    const { result } = renderItemImages();

    await act(async () => {
      await result.current.uploadImage('item-1', new File(['x'], 'p.gif'));
    });

    expect(uploadImageObject).not.toHaveBeenCalled();
    expect(createImageRow).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not upload this image. Please try again.',
    );
    consoleError.mockRestore();
  });

  it('keeps the photograph when only the thumbnail upload fails', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const thumbError = new Error('thumb');
    vi.mocked(uploadImageObject)
      .mockResolvedValueOnce({ error: null } as never)
      .mockResolvedValueOnce({ error: thumbError } as never);
    const { result } = renderItemImages();

    await act(async () => {
      await result.current.uploadImage('item-1', new File(['x'], 'p.jpg'));
    });

    expect(createImageRow).toHaveBeenCalledWith(
      expect.objectContaining({ path_thumb: null }),
    );
    expect(consoleWarn).toHaveBeenCalledWith(
      'Thumbnail upload failed:',
      thumbError,
    );
    consoleWarn.mockRestore();
  });

  it('warns about nothing when both uploads succeed', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderItemImages();

    await act(async () => {
      await result.current.uploadImage('item-1', new File(['x'], 'p.jpg'));
    });

    expect(consoleWarn).not.toHaveBeenCalled();
    consoleWarn.mockRestore();
  });

  it('reports a failed full-size upload and keeps no row', async () => {
    vi.mocked(uploadImageObject).mockResolvedValue({
      error: new Error('storage full'),
    } as never);
    const { result } = renderItemImages();

    await act(async () => {
      await result.current.uploadImage('item-1', new File(['x'], 'p.jpg'));
    });

    expect(createImageRow).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not upload this image. Please try again.',
    );
    expect(result.current.pendingUploads['item-1']).toBeUndefined();
  });

  it('says the photograph limit is reached when the row is refused for its quota', async () => {
    vi.mocked(createImageRow).mockResolvedValue({
      error: {
        code: 'PT507',
        message: 'photo storage quota of 1 GiB reached',
      },
    } as never);
    const { result } = renderItemImages();

    await act(async () => {
      await result.current.uploadImage('item-1', new File(['x'], 'p.jpg'));
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The limit of 1 GiB of photographs is reached. Delete some to add more.',
    );
  });

  it('reports a photograph whose row cannot be recorded', async () => {
    vi.mocked(createImageRow).mockResolvedValue({
      error: new Error('rls'),
    } as never);
    const { result } = renderItemImages();

    await act(async () => {
      await result.current.uploadImage('item-1', new File(['x'], 'p.jpg'));
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not upload this image. Please try again.',
    );
  });

  it('refuses to write anything without a verified session', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    vi.mocked(verifiedUserId).mockResolvedValue(null);
    const { result } = renderItemImages();

    await act(async () => {
      await result.current.uploadImage('item-1', new File(['x'], 'p.jpg'));
    });

    expect(uploadImageObject).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toBeVisible();
    // Logged under the upload-image scope, distinct from every other failure the same catch handles.
    expect(consoleError).toHaveBeenCalledWith(
      'upload image',
      expect.objectContaining({ message: 'No user session' }),
    );
    consoleError.mockRestore();
  });

  it('shows no photographs yet if the post-upload refresh answers with none for this item', async () => {
    vi.mocked(listImagesForItems).mockResolvedValue({
      data: [row('other-img', 'other-item')],
      error: null,
    });
    const { result } = renderItemImages();

    await act(async () => {
      await result.current.uploadImage('item-1', new File(['x'], 'p.jpg'));
    });

    expect(result.current.images['item-1']).toEqual([]);
  });

  it('treats an empty post-upload listing as no images for this item', async () => {
    vi.mocked(listImagesForItems).mockResolvedValue({
      data: [],
      error: null,
    });
    const { result } = renderItemImages();

    await act(async () => {
      await result.current.uploadImage('item-1', new File(['x'], 'p.jpg'));
    });

    expect(result.current.images['item-1']).toEqual([]);
  });

  it('keeps no placeholder when the post-upload refresh fails to list images', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    vi.mocked(listImagesForItems).mockResolvedValue({
      data: null,
      error: new Error('boom'),
    });
    const { result } = renderItemImages();

    await act(async () => {
      await result.current.uploadImage('item-1', new File(['x'], 'p.jpg'));
    });

    expect(consoleError).toHaveBeenCalledWith(
      'Failed to list images',
      expect.any(Error),
    );
    // Not `toBeUndefined()`: that also passes for a key explicitly set to `undefined`.
    expect(Object.keys(result.current.images)).not.toContain('item-1');
    consoleError.mockRestore();
  });
});

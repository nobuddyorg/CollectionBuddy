// @vitest-environment jsdom
import { act, renderHook, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import { ConfirmProvider } from '../Confirm/ConfirmProvider';
import { verifiedUserId } from '../../data/auth';
import {
  createImageRow,
  createSignedUrls,
  listImagesForItems,
  uploadImageObject,
} from '../../data/images';
import { clearImageCache } from './imageCache';
import { useItemImages } from './useItemImages';

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

// The real one needs a Worker; this stand-in also records the sizes it was asked for.
const compressions: number[] = [];
vi.mock('browser-image-compression', () => ({
  default: vi.fn(async (file: Blob, options: { maxWidthOrHeight: number }) => {
    compressions.push(options.maxWidthOrHeight);
    return new Blob([`compressed-${options.maxWidthOrHeight}`]);
  }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </I18nProvider>
  );
}

function row(id: string, itemId: string) {
  return {
    id,
    item_id: itemId,
    path_full: `uid/${itemId}/${id}.webp`,
    path_thumb: null,
  };
}

function signsEverything() {
  vi.mocked(createSignedUrls).mockImplementation(
    async (paths: string[]) =>
      ({
        data: paths.map((path) => ({ path, signedUrl: `signed://${path}` })),
        error: null,
      }) as never,
  );
}

describe('useItemImages uploadImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    compressions.length = 0;
    clearImageCache();
    window.localStorage.setItem('lang', 'en');
    vi.mocked(verifiedUserId).mockResolvedValue('uid');
    vi.mocked(listImagesForItems).mockResolvedValue({
      data: [],
      error: null,
    });
    vi.mocked(uploadImageObject).mockResolvedValue({ error: null } as never);
    vi.mocked(createImageRow).mockResolvedValue({ error: null } as never);
    signsEverything();
  });

  it('stores a full size and a thumbnail under the uploader own prefix, then records the row', async () => {
    const { result } = renderHook(() => useItemImages(), { wrapper });

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

  it('keeps the photograph when only the thumbnail upload fails', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const thumbError = new Error('thumb');
    vi.mocked(uploadImageObject)
      .mockResolvedValueOnce({ error: null } as never)
      .mockResolvedValueOnce({ error: thumbError } as never);
    const { result } = renderHook(() => useItemImages(), { wrapper });

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
    const { result } = renderHook(() => useItemImages(), { wrapper });

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
    const { result } = renderHook(() => useItemImages(), { wrapper });

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
    const { result } = renderHook(() => useItemImages(), { wrapper });

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
    const { result } = renderHook(() => useItemImages(), { wrapper });

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
    const { result } = renderHook(() => useItemImages(), { wrapper });

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
    const { result } = renderHook(() => useItemImages(), { wrapper });

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
    const { result } = renderHook(() => useItemImages(), { wrapper });

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
    const { result } = renderHook(() => useItemImages(), { wrapper });

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

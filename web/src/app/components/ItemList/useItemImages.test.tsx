// @vitest-environment jsdom
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import { ConfirmProvider } from '../Confirm/ConfirmProvider';
import { verifiedUserId } from '../../data/auth';
import {
  createImageRow,
  createSignedUrls,
  deleteImageRow,
  listImagePathsForItems,
  listImagesForItems,
  removeImageObjects,
  uploadImageObject,
} from '../../data/images';
import { clearImageCache } from './imageCache';
import { useItemImages } from './useItemImages';
import type { ImgEntry } from './types';

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

// The real one needs a Worker; every test drives it through this stand-in,
// which also records the sizes it was asked for.
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

function row(id: string, itemId: string, thumb: string | null = null) {
  return {
    id,
    item_id: itemId,
    path_full: `uid/${itemId}/${id}.webp`,
    path_thumb: thumb,
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

function entry(id: string, itemId: string): ImgEntry {
  return {
    id,
    pathFull: `uid/${itemId}/${id}.webp`,
    urlFull: `signed://uid/${itemId}/${id}.webp`,
    pathThumb: undefined,
    urlThumb: undefined,
  };
}

async function acceptConfirmation() {
  await userEvent.click(await screen.findByTestId('confirm-accept'));
}

// The delete itself waits out the toast's undo window; closing the toast is
// what commits it, the same as letting it expire.
async function commitDeferredDelete() {
  await screen.findByRole('status');
  await userEvent.click(screen.getByRole('button', { name: 'Close' }));
}

describe('useItemImages', () => {
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

  describe('refreshAllImages', () => {
    it('signs every listed photograph and keys them to their item', async () => {
      vi.mocked(listImagesForItems).mockResolvedValue({
        data: [row('img-1', 'item-1'), row('img-2', 'item-2')],
        error: null,
      });
      const { result } = renderHook(() => useItemImages(), { wrapper });

      await act(async () => {
        await result.current.refreshAllImages(['item-1', 'item-2']);
      });

      expect(result.current.images['item-1']).toEqual([
        entry('img-1', 'item-1'),
      ]);
      expect(result.current.images['item-2']).toEqual([
        entry('img-2', 'item-2'),
      ]);
      expect(result.current.loadingItems.size).toBe(0);
    });

    it('asks for nothing when given no items', async () => {
      const { result } = renderHook(() => useItemImages(), { wrapper });

      await act(async () => {
        await result.current.refreshAllImages([]);
      });

      expect(listImagesForItems).not.toHaveBeenCalled();
    });

    it('treats a null answer with no error as no images for any of them', async () => {
      vi.mocked(listImagesForItems).mockResolvedValue({
        data: null,
        error: null,
      });
      const { result } = renderHook(() => useItemImages(), { wrapper });

      await act(async () => {
        await result.current.refreshAllImages(['item-1']);
      });

      expect(result.current.images['item-1']).toEqual([]);
    });

    it('reports a failed listing and settles the item as empty', async () => {
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const listError = new Error('nope');
      vi.mocked(listImagesForItems).mockResolvedValue({
        data: null,
        error: listError,
      });
      const { result } = renderHook(() => useItemImages(), { wrapper });

      await act(async () => {
        await result.current.refreshAllImages(['item-1']);
      });

      expect(consoleError).toHaveBeenCalledWith(
        'Failed to list images',
        listError,
      );
      expect(result.current.images['item-1']).toEqual([]);
      expect(result.current.loadingItems.size).toBe(0);
      consoleError.mockRestore();
    });

    it('logs nothing when the listing succeeds', async () => {
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      vi.mocked(listImagesForItems).mockResolvedValue({
        data: [row('img-1', 'item-1')],
        error: null,
      });
      const { result } = renderHook(() => useItemImages(), { wrapper });

      await act(async () => {
        await result.current.refreshAllImages(['item-1']);
      });

      expect(consoleError).not.toHaveBeenCalled();
      consoleError.mockRestore();
    });

    it('replaces only the items it was asked about, keeping the rest untouched', async () => {
      vi.mocked(listImagesForItems).mockResolvedValue({
        data: [row('img-1', 'item-1'), row('img-2', 'item-2')],
        error: null,
      });
      const { result } = renderHook(() => useItemImages(), { wrapper });
      await act(async () => {
        await result.current.refreshAllImages(['item-1', 'item-2']);
      });
      const untouched = result.current.images['item-2'];

      vi.mocked(listImagesForItems).mockResolvedValue({
        data: [row('img-1-b', 'item-1')],
        error: null,
      });
      await act(async () => {
        await result.current.refreshAllImages(['item-1']);
      });

      expect(result.current.images['item-1']).toEqual([
        entry('img-1-b', 'item-1'),
      ]);
      // Not just equal in value -- the same reference, proving item-2's
      // entry was carried over rather than rebuilt from scratch.
      expect(result.current.images['item-2']).toBe(untouched);
    });

    it('marks the requested items as loading while the request is still in flight', async () => {
      let resolveList!: (v: {
        data: ReturnType<typeof row>[] | null;
        error: unknown;
      }) => void;
      vi.mocked(listImagesForItems).mockReturnValue(
        new Promise((resolve) => {
          resolveList = resolve;
        }) as never,
      );
      const { result } = renderHook(() => useItemImages(), { wrapper });

      let pending!: Promise<void>;
      act(() => {
        pending = result.current.refreshAllImages(['item-1']);
      });

      expect(result.current.loadingItems.has('item-1')).toBe(true);

      await act(async () => {
        resolveList({ data: [], error: null });
        await pending;
      });

      expect(result.current.loadingItems.has('item-1')).toBe(false);
    });
  });

  describe('uploadImage', () => {
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

      const paths = vi
        .mocked(uploadImageObject)
        .mock.calls.map(([path]) => path);
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
      // The post-upload refresh lists exactly this item, not every item on
      // the page or none at all.
      expect(listImagesForItems).toHaveBeenCalledWith(['item-1']);
    });

    it('keeps the photograph when only the thumbnail upload fails', async () => {
      const consoleWarn = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});
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
      const consoleWarn = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});
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
      // The specific reason (no session) is logged under the upload-image
      // scope, distinct from every other failure this same catch handles.
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

    it('treats a null post-upload listing as no images for this item', async () => {
      vi.mocked(listImagesForItems).mockResolvedValue({
        data: null,
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
      // Not just `toBeUndefined()` -- that also passes for a key explicitly
      // set to `undefined`, which wouldn't prove the placeholder was never
      // written at all.
      expect(Object.keys(result.current.images)).not.toContain('item-1');
      consoleError.mockRestore();
    });

    it('counts concurrent uploads rather than flagging one', async () => {
      const { result } = renderHook(() => useItemImages(), { wrapper });
      let held: (() => void)[] = [];
      vi.mocked(uploadImageObject).mockImplementation(
        () =>
          new Promise<{ error: null }>((resolve) => {
            held.push(() => resolve({ error: null }));
          }) as never,
      );

      act(() => {
        void result.current.uploadImage('item-1', new File(['x'], 'a.jpg'));
        void result.current.uploadImage('item-1', new File(['y'], 'b.jpg'));
      });
      await waitFor(() =>
        expect(result.current.pendingUploads['item-1']).toBe(2),
      );

      // Each upload writes a thumbnail after its full size, so letting both
      // run to the end means releasing whatever is held until nothing is.
      await act(async () => {
        while (held.length) {
          const pending = held;
          held = [];
          for (const resolve of pending) resolve();
          await Promise.resolve();
        }
      });
      await waitFor(() =>
        expect(result.current.pendingUploads['item-1']).toBeUndefined(),
      );
    });

    it('drops the count by one rather than clearing it, while a second upload for the same item is still pending', async () => {
      const { result } = renderHook(() => useItemImages(), { wrapper });
      let releaseFull!: () => void;
      vi.mocked(uploadImageObject).mockImplementationOnce(
        () =>
          new Promise<{ error: null }>((resolve) => {
            releaseFull = () => resolve({ error: null });
          }) as never,
      );

      act(() => {
        void result.current.uploadImage('item-1', new File(['x'], 'a.jpg'));
      });
      await waitFor(() =>
        expect(result.current.pendingUploads['item-1']).toBe(1),
      );

      // A second upload for the same item runs to completion (its own
      // full+thumb calls fall through to the default resolved mock) while
      // the first is still held open.
      await act(async () => {
        await result.current.uploadImage('item-1', new File(['y'], 'b.jpg'));
      });

      expect(result.current.pendingUploads['item-1']).toBe(1);

      await act(async () => {
        releaseFull();
        await Promise.resolve();
      });
    });

    it('does not let one item finishing its upload touch another item still uploading', async () => {
      const { result } = renderHook(() => useItemImages(), { wrapper });
      let releaseItem1!: () => void;
      vi.mocked(uploadImageObject).mockImplementationOnce(
        () =>
          new Promise<{ error: null }>((resolve) => {
            releaseItem1 = () => resolve({ error: null });
          }) as never,
      );

      act(() => {
        void result.current.uploadImage('item-1', new File(['x'], 'a.jpg'));
      });
      await waitFor(() =>
        expect(result.current.pendingUploads['item-1']).toBe(1),
      );

      await act(async () => {
        await result.current.uploadImage('item-2', new File(['y'], 'b.jpg'));
      });
      expect(result.current.pendingUploads['item-2']).toBeUndefined();

      // item-2 finishing (and clearing its own entry in the `finally`
      // block) must not have wiped item-1's still-in-flight count.
      expect(result.current.pendingUploads['item-1']).toBe(1);

      await act(async () => {
        releaseItem1();
        await Promise.resolve();
      });
    });
  });

  // Supabase signs for an hour, so a tab left open longer than that would
  // turn every thumbnail into a broken image.
  describe('keeping signatures fresh', () => {
    // Installed before the hook mounts: the interval it registers has to be
    // one this test can advance.
    async function withOnePhotographAndFakeTimers() {
      vi.useFakeTimers();
      vi.mocked(listImagesForItems).mockResolvedValue({
        data: [row('img-1', 'item-1')],
        error: null,
      });
      const hook = renderHook(() => useItemImages(), { wrapper });
      await act(async () => {
        await hook.result.current.refreshAllImages(['item-1']);
      });
      return hook;
    }

    it('re-signs what is on screen once the signatures are near expiry', async () => {
      const { result } = await withOnePhotographAndFakeTimers();
      try {
        vi.mocked(listImagesForItems).mockClear();
        vi.setSystemTime(Date.now() + 56 * 60_000);
        await act(async () => {
          await vi.advanceTimersByTimeAsync(60_000);
        });

        expect(listImagesForItems).toHaveBeenCalledWith(['item-1']);
        expect(result.current.images['item-1']).toHaveLength(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('leaves signatures that are still good alone', async () => {
      await withOnePhotographAndFakeTimers();
      try {
        vi.mocked(listImagesForItems).mockClear();
        await act(async () => {
          await vi.advanceTimersByTimeAsync(5 * 60_000);
        });

        expect(listImagesForItems).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('re-signs when a backgrounded tab is looked at again', async () => {
      const { result } = await withOnePhotographAndFakeTimers();
      try {
        vi.mocked(listImagesForItems).mockClear();
        vi.setSystemTime(Date.now() + 56 * 60_000);
        await act(async () => {
          document.dispatchEvent(new Event('visibilitychange'));
          await vi.advanceTimersByTimeAsync(0);
        });

        expect(listImagesForItems).toHaveBeenCalledWith(['item-1']);
        expect(result.current.images['item-1']).toHaveLength(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('does nothing once every tracked item has been forgotten', async () => {
      vi.mocked(removeImageObjects).mockResolvedValue({
        data: [],
        error: null,
      });
      const { result } = await withOnePhotographAndFakeTimers();
      try {
        await act(async () => {
          await result.current.removeImageBytes('item-1', [
            { path_full: 'uid/item-1/img-1.webp', path_thumb: null },
          ]);
        });
        expect(result.current.images['item-1']).toBeUndefined();

        vi.mocked(listImagesForItems).mockClear();
        vi.setSystemTime(Date.now() + 56 * 60_000);
        await act(async () => {
          await vi.advanceTimersByTimeAsync(60_000);
        });

        expect(listImagesForItems).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('does nothing before anything has been signed at all', async () => {
      vi.useFakeTimers();
      try {
        renderHook(() => useItemImages(), { wrapper });
        vi.mocked(listImagesForItems).mockClear();
        await act(async () => {
          await vi.advanceTimersByTimeAsync(2 * 3600_000);
        });

        expect(listImagesForItems).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('refreshes right at the margin boundary, not only once past it', async () => {
      const { result } = await withOnePhotographAndFakeTimers();
      try {
        vi.mocked(listImagesForItems).mockClear();
        // Advancing (not jumping via setSystemTime) so the 55th 60s
        // interval tick lands at *exactly* 55 minutes elapsed --
        // SIGNED_URL_SERVER_TTL_MS (60m) minus REFRESH_MARGIN_MS (5m) --
        // rather than however far past it a time jump would land.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(55 * 60_000);
        });

        expect(listImagesForItems).toHaveBeenCalledWith(['item-1']);
        expect(result.current.images['item-1']).toHaveLength(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('stops refreshing and stops listening for visibility changes once unmounted', async () => {
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
      const { unmount } = await withOnePhotographAndFakeTimers();
      try {
        unmount();
        expect(removeEventListenerSpy).toHaveBeenCalledWith(
          'visibilitychange',
          expect.any(Function),
        );

        vi.mocked(listImagesForItems).mockClear();
        vi.setSystemTime(Date.now() + 56 * 60_000);
        await act(async () => {
          document.dispatchEvent(new Event('visibilitychange'));
          await vi.advanceTimersByTimeAsync(60_000);
        });

        expect(listImagesForItems).not.toHaveBeenCalled();
      } finally {
        removeEventListenerSpy.mockRestore();
        vi.useRealTimers();
      }
    });
  });

  describe('deleteImage', () => {
    const img = entry('img-1', 'item-1');
    let consoleErrorSpy: MockInstance<typeof console.error>;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    async function withOnePhotograph() {
      vi.mocked(listImagesForItems).mockResolvedValue({
        data: [row('img-1', 'item-1')],
        error: null,
      });
      const hook = renderHook(() => useItemImages(), { wrapper });
      await act(async () => {
        await hook.result.current.refreshAllImages(['item-1']);
      });
      return hook;
    }

    it('tolerates deleting a photo for an item with no tracked images yet', async () => {
      vi.mocked(deleteImageRow).mockResolvedValue({
        data: { path_full: 'uid/item-1/img-1.webp', path_thumb: null },
        error: null,
      } as never);
      vi.mocked(removeImageObjects).mockResolvedValue({ error: null } as never);
      const { result } = renderHook(() => useItemImages(), { wrapper });

      act(() => {
        void result.current.deleteImage('item-1', img);
      });
      await acceptConfirmation();
      expect(result.current.images['item-1']).toEqual([]);

      await commitDeferredDelete();
      expect(deleteImageRow).toHaveBeenCalledWith('img-1');
    });

    it('tolerates undo for an item with no tracked images yet', async () => {
      vi.mocked(deleteImageRow).mockResolvedValue({
        data: null,
        error: new Error('rls'),
      } as never);
      const { result } = renderHook(() => useItemImages(), { wrapper });

      act(() => {
        void result.current.deleteImage('item-1', img);
      });
      await acceptConfirmation();
      await commitDeferredDelete();

      expect(result.current.images['item-1']).toEqual([img]);
    });

    it('keeps the photograph when the confirmation is declined', async () => {
      const { result } = await withOnePhotograph();

      act(() => {
        void result.current.deleteImage('item-1', img);
      });
      expect(await screen.findByRole('alertdialog')).toHaveTextContent(
        'Delete this photograph?',
      );
      await userEvent.click(await screen.findByTestId('confirm-cancel'));

      expect(result.current.images['item-1']).toEqual([img]);
      expect(deleteImageRow).not.toHaveBeenCalled();
    });

    it('removes the row and then its objects once the undo window closes', async () => {
      vi.mocked(deleteImageRow).mockResolvedValue({
        data: {
          path_full: 'uid/item-1/img-1.webp',
          path_thumb: 'uid/item-1/img-1.thumb.webp',
        },
        error: null,
      } as never);
      vi.mocked(removeImageObjects).mockResolvedValue({ error: null } as never);
      const { result } = await withOnePhotograph();

      act(() => {
        void result.current.deleteImage('item-1', img);
      });
      await acceptConfirmation();
      expect(result.current.images['item-1']).toEqual([]);

      await commitDeferredDelete();

      expect(deleteImageRow).toHaveBeenCalledWith('img-1');
      expect(removeImageObjects).toHaveBeenCalledWith([
        'uid/item-1/img-1.webp',
        'uid/item-1/img-1.thumb.webp',
      ]);
    });

    it('puts the photograph back when undo is used', async () => {
      const { result } = await withOnePhotograph();

      act(() => {
        void result.current.deleteImage('item-1', img);
      });
      await acceptConfirmation();
      await userEvent.click(
        await screen.findByRole('button', { name: 'Undo' }),
      );

      expect(result.current.images['item-1']).toEqual([img]);
      expect(deleteImageRow).not.toHaveBeenCalled();
    });

    it('puts the photograph back when the row delete fails', async () => {
      vi.mocked(deleteImageRow).mockResolvedValue({
        data: null,
        error: new Error('rls'),
      } as never);
      const { result } = await withOnePhotograph();

      act(() => {
        void result.current.deleteImage('item-1', img);
      });
      await acceptConfirmation();
      await commitDeferredDelete();

      expect(result.current.images['item-1']).toEqual([img]);
      expect(removeImageObjects).not.toHaveBeenCalled();
    });

    // The row is already gone by then: a leak for the sweep, not an undo.
    it('reports objects it could not remove without restoring the entry', async () => {
      vi.mocked(deleteImageRow).mockResolvedValue({
        data: { path_full: 'uid/item-1/img-1.webp', path_thumb: null },
        error: null,
      } as never);
      const removeError = new Error('gone');
      vi.mocked(removeImageObjects).mockResolvedValue({
        error: removeError,
      } as never);
      const { result } = await withOnePhotograph();

      act(() => {
        void result.current.deleteImage('item-1', img);
      });
      await acceptConfirmation();
      await commitDeferredDelete();

      expect(removeImageObjects).toHaveBeenCalledWith([
        'uid/item-1/img-1.webp',
      ]);
      expect(result.current.images['item-1']).toEqual([]);
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'This photograph was deleted, but its file could not be fully removed and may still count against your storage.',
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'remove image bytes',
        removeError,
      );
    });

    it('reports a row it could not delete, tagged under its own scope', async () => {
      const rowError = new Error('rls');
      vi.mocked(deleteImageRow).mockResolvedValue({
        data: null,
        error: rowError,
      } as never);
      const { result } = await withOnePhotograph();

      act(() => {
        void result.current.deleteImage('item-1', img);
      });
      await acceptConfirmation();
      await commitDeferredDelete();

      expect(result.current.images['item-1']).toEqual([img]);
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Could not delete this image. Please try again.',
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith('delete image', rowError);
    });

    it('reports nothing when the delete succeeds cleanly', async () => {
      vi.mocked(deleteImageRow).mockResolvedValue({
        data: { path_full: 'uid/item-1/img-1.webp', path_thumb: null },
        error: null,
      } as never);
      vi.mocked(removeImageObjects).mockResolvedValue({ error: null } as never);
      const { result } = await withOnePhotograph();

      act(() => {
        void result.current.deleteImage('item-1', img);
      });
      await acceptConfirmation();
      await commitDeferredDelete();

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('announces the deletion by name as a polite success toast', async () => {
      const { result } = await withOnePhotograph();

      act(() => {
        void result.current.deleteImage('item-1', img);
      });
      await acceptConfirmation();

      expect(await screen.findByRole('status')).toHaveTextContent(
        'Image deleted.',
      );
    });

    describe('with several photographs on the same entry', () => {
      const imgA = entry('img-a', 'item-1');
      const imgB = entry('img-b', 'item-1');
      const imgC = entry('img-c', 'item-1');

      async function withThreePhotographs() {
        vi.mocked(listImagesForItems).mockResolvedValue({
          data: [
            row('img-a', 'item-1'),
            row('img-b', 'item-1'),
            row('img-c', 'item-1'),
          ],
          error: null,
        });
        const hook = renderHook(() => useItemImages(), { wrapper });
        await act(async () => {
          await hook.result.current.refreshAllImages(['item-1']);
        });
        return hook;
      }

      it('removes only the middle photograph, leaving the others untouched', async () => {
        const { result } = await withThreePhotographs();

        act(() => {
          void result.current.deleteImage('item-1', imgB);
        });
        await acceptConfirmation();

        expect(result.current.images['item-1']).toEqual([imgA, imgC]);
      });

      it('restores a deleted middle photograph to its original position on undo', async () => {
        const { result } = await withThreePhotographs();

        act(() => {
          void result.current.deleteImage('item-1', imgB);
        });
        await acceptConfirmation();
        await userEvent.click(
          await screen.findByRole('button', { name: 'Undo' }),
        );

        expect(result.current.images['item-1']).toEqual([imgA, imgB, imgC]);
      });
    });
  });

  describe('deleting an entry', () => {
    it('reads the paths a cascade is about to take with it', async () => {
      const paths = [{ path_full: 'uid/item-1/a.webp', path_thumb: null }];
      vi.mocked(listImagePathsForItems).mockResolvedValue({
        data: paths,
        error: null,
      } as never);
      const { result } = renderHook(() => useItemImages(), { wrapper });

      await expect(
        result.current.captureItemImagePaths('item-1'),
      ).resolves.toEqual(paths);
    });

    it('treats a null answer with no error as no paths to clean up', async () => {
      vi.mocked(listImagePathsForItems).mockResolvedValue({
        data: null,
        error: null,
      });
      const { result } = renderHook(() => useItemImages(), { wrapper });

      await expect(
        result.current.captureItemImagePaths('item-1'),
      ).resolves.toEqual([]);
    });

    it('reads paths for exactly the entry being deleted', async () => {
      vi.mocked(listImagePathsForItems).mockResolvedValue({
        data: [],
        error: null,
      });
      const { result } = renderHook(() => useItemImages(), { wrapper });

      await result.current.captureItemImagePaths('item-1');

      expect(listImagePathsForItems).toHaveBeenCalledWith(['item-1']);
    });

    it('answers with nothing when those paths cannot be read', async () => {
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const pathsError = new Error('nope');
      vi.mocked(listImagePathsForItems).mockResolvedValue({
        data: null,
        error: pathsError,
      });
      const { result } = renderHook(() => useItemImages(), { wrapper });

      await expect(
        result.current.captureItemImagePaths('item-1'),
      ).resolves.toEqual([]);
      expect(consoleError).toHaveBeenCalledWith(
        'Failed to read image paths before delete',
        pathsError,
      );
      consoleError.mockRestore();
    });

    it('removes every object of every photograph and forgets the item', async () => {
      vi.mocked(removeImageObjects).mockResolvedValue({ error: null } as never);
      vi.mocked(listImagesForItems).mockResolvedValue({
        data: [row('img-1', 'item-1'), row('img-2', 'item-2')],
        error: null,
      });
      const { result } = renderHook(() => useItemImages(), { wrapper });
      await act(async () => {
        await result.current.refreshAllImages(['item-1', 'item-2']);
      });
      const untouched = result.current.images['item-2'];

      await act(async () => {
        await result.current.removeImageBytes('item-1', [
          { path_full: 'uid/item-1/a.webp', path_thumb: 'uid/item-1/a.t.webp' },
          { path_full: 'uid/item-1/b.webp', path_thumb: null },
        ]);
      });

      expect(removeImageObjects).toHaveBeenCalledWith([
        'uid/item-1/a.webp',
        'uid/item-1/a.t.webp',
        'uid/item-1/b.webp',
      ]);
      expect(result.current.images['item-1']).toBeUndefined();
      // Forgetting item-1 must not disturb item-2's own entry.
      expect(result.current.images['item-2']).toBe(untouched);
    });

    it('does not call Storage at all for an entry with no photographs', async () => {
      const { result } = renderHook(() => useItemImages(), { wrapper });

      await act(async () => {
        await result.current.removeImageBytes('item-1', []);
      });

      expect(removeImageObjects).not.toHaveBeenCalled();
    });

    it('rethrows a failure to remove the bytes', async () => {
      vi.mocked(removeImageObjects).mockResolvedValue({
        error: new Error('gone'),
      } as never);
      const { result } = renderHook(() => useItemImages(), { wrapper });

      await expect(
        result.current.removeImageBytes('item-1', [
          { path_full: 'uid/item-1/a.webp', path_thumb: null },
        ]),
      ).rejects.toThrow();
    });
  });
});

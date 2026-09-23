// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import { ConfirmProvider } from '../Confirm/ConfirmProvider';
import {
  createSignedUrls,
  listImagesForItems,
  removeImageObjects,
} from '../../data/images';
import { clearImageCache } from './imageCache';
import { useItemImages } from './useItemImages';
import type { ImageEntry } from './types';

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

function entry(id: string, itemId: string): ImageEntry {
  return {
    id,
    pathFull: `uid/${itemId}/${id}.webp`,
    urlFull: `signed://uid/${itemId}/${id}.webp`,
    pathThumb: undefined,
    urlThumb: undefined,
  };
}

describe('useItemImages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearImageCache();
    window.localStorage.setItem('lang', 'en');
    vi.mocked(listImagesForItems).mockResolvedValue({
      data: [],
      error: null,
    });
    signsEverything();
  });

  describe('signAllFor', () => {
    it('signs the photographs past the plates and shows them signed', async () => {
      vi.mocked(listImagesForItems).mockResolvedValue({
        data: Array.from({ length: 6 }, (_, i) => row(`img-${i}`, 'item-1')),
        error: null,
      });
      const { result } = renderHook(() => useItemImages(), { wrapper });
      await act(async () => {
        await result.current.refreshAllImages(['item-1']);
      });
      expect(result.current.images['item-1'][5].urlFull).toBeUndefined();

      await act(async () => {
        await result.current.signAllFor('item-1');
      });

      expect(vi.mocked(createSignedUrls).mock.calls.at(-1)?.[0]).toEqual([
        'uid/item-1/img-5.webp',
      ]);
      expect(result.current.images['item-1'][5]).toEqual(
        entry('img-5', 'item-1'),
      );
    });

    it('asks for nothing when every photograph is already signed', async () => {
      vi.mocked(listImagesForItems).mockResolvedValue({
        data: [row('img-1', 'item-1')],
        error: null,
      });
      const { result } = renderHook(() => useItemImages(), { wrapper });
      await act(async () => {
        await result.current.refreshAllImages(['item-1']);
      });
      vi.mocked(createSignedUrls).mockClear();

      await act(async () => {
        await result.current.signAllFor('item-1');
      });

      expect(createSignedUrls).not.toHaveBeenCalled();
    });

    it('asks for nothing for an item it has no photographs of', async () => {
      const { result } = renderHook(() => useItemImages(), { wrapper });

      await act(async () => {
        await result.current.signAllFor('item-unknown');
      });

      expect(createSignedUrls).not.toHaveBeenCalled();
    });
  });

  // Supabase signs for an hour, so a tab left open longer would turn every thumbnail into a broken image.
  describe('keeping signatures fresh', () => {
    // Installed before the hook mounts, so the interval it registers is one this test can advance.
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
        // Advanced, not jumped: the 55th tick lands at exactly the TTL (60m) minus the margin (5m).
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
});

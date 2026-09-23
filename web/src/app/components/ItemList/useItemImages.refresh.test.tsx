// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import { ConfirmProvider } from '../Confirm/ConfirmProvider';
import { createSignedUrls, listImagesForItems } from '../../data/images';
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

    it('treats an empty answer as no images for any of them', async () => {
      vi.mocked(listImagesForItems).mockResolvedValue({
        data: [],
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
      // The same reference, proving item-2's entry was carried over rather than rebuilt.
      expect(result.current.images['item-2']).toBe(untouched);
    });

    it('marks the requested items as loading while the request is still in flight', async () => {
      let resolveList!: (value: {
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

  describe('showImages', () => {
    it('signs rows the page read already carried, without listing again', async () => {
      const { result } = renderHook(() => useItemImages(), { wrapper });

      await act(async () => {
        await result.current.showImages(
          ['item-1', 'item-2'],
          [row('img-1', 'item-1')],
        );
      });

      expect(listImagesForItems).not.toHaveBeenCalled();
      expect(result.current.images).toEqual({
        'item-1': [entry('img-1', 'item-1')],
        'item-2': [],
      });
      expect(result.current.loadingItems.size).toBe(0);
    });

    it('marks the items as loading until their signatures are back', async () => {
      let resolveSign!: (value: unknown) => void;
      vi.mocked(createSignedUrls).mockReturnValue(
        new Promise((resolve) => {
          resolveSign = resolve;
        }) as never,
      );
      const { result } = renderHook(() => useItemImages(), { wrapper });

      let pending!: Promise<void>;
      act(() => {
        pending = result.current.showImages(
          ['item-1'],
          [row('img-1', 'item-1')],
        );
      });

      expect(result.current.loadingItems.has('item-1')).toBe(true);

      await act(async () => {
        resolveSign({ data: [], error: null });
        await pending;
      });

      expect(result.current.loadingItems.has('item-1')).toBe(false);
    });
  });
});

// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import { ConfirmProvider } from '../Confirm/ConfirmProvider';
import {
  createSignedUrls,
  listImagePathsForItems,
  listImagesForItems,
  removeImageObjects,
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

describe('useItemImages when an entry is deleted', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearImageCache();
    window.localStorage.setItem('lang', 'en');
    vi.mocked(createSignedUrls).mockImplementation(
      async (paths: string[]) =>
        ({
          data: paths.map((path) => ({ path, signedUrl: `signed://${path}` })),
          error: null,
        }) as never,
    );
  });

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

  it('treats an empty answer as no paths to clean up', async () => {
    vi.mocked(listImagePathsForItems).mockResolvedValue({
      data: [],
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

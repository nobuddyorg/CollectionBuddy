// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  listImagePathsForItems,
  listImagesForItems,
  removeImageObjects,
} from '../../data/images';
import {
  renderItemImages,
  resetImageTestState,
  row,
  signsEverything,
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

describe('useItemImages when an entry is deleted', () => {
  beforeEach(() => {
    resetImageTestState();
    signsEverything();
  });

  it('reads the paths a cascade is about to take with it', async () => {
    const paths = [{ path_full: 'uid/item-1/a.webp', path_thumb: null }];
    vi.mocked(listImagePathsForItems).mockResolvedValue({
      data: paths,
      error: null,
    } as never);
    const { result } = renderItemImages();

    await expect(
      result.current.captureItemImagePaths('item-1'),
    ).resolves.toEqual(paths);
  });

  it('treats an empty answer as no paths to clean up', async () => {
    vi.mocked(listImagePathsForItems).mockResolvedValue({
      data: [],
      error: null,
    });
    const { result } = renderItemImages();

    await expect(
      result.current.captureItemImagePaths('item-1'),
    ).resolves.toEqual([]);
  });

  it('reads paths for exactly the entry being deleted', async () => {
    vi.mocked(listImagePathsForItems).mockResolvedValue({
      data: [],
      error: null,
    });
    const { result } = renderItemImages();

    await result.current.captureItemImagePaths('item-1');

    expect(listImagePathsForItems).toHaveBeenCalledWith(['item-1']);
  });

  it('refuses to answer when those paths cannot be read, so no delete proceeds blind', async () => {
    const pathsError = new Error('nope');
    vi.mocked(listImagePathsForItems).mockResolvedValue({
      data: null,
      error: pathsError,
    });
    const { result } = renderItemImages();

    await expect(
      result.current.captureItemImagePaths('item-1'),
    ).rejects.toMatchObject({
      message: 'Could not read image paths before delete',
      cause: pathsError,
    });
  });
  it('removes every object of every photograph and forgets the item', async () => {
    vi.mocked(removeImageObjects).mockResolvedValue({ error: null } as never);
    vi.mocked(listImagesForItems).mockResolvedValue({
      data: [row('img-1', 'item-1'), row('img-2', 'item-2')],
      error: null,
    });
    const { result } = renderItemImages();
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
    const { result } = renderItemImages();

    await act(async () => {
      await result.current.removeImageBytes('item-1', []);
    });

    expect(removeImageObjects).not.toHaveBeenCalled();
  });

  it('rethrows a failure to remove the bytes', async () => {
    vi.mocked(removeImageObjects).mockResolvedValue({
      error: new Error('gone'),
    } as never);
    const { result } = renderItemImages();

    await expect(
      result.current.removeImageBytes('item-1', [
        { path_full: 'uid/item-1/a.webp', path_thumb: null },
      ]),
    ).rejects.toThrow();
  });
});

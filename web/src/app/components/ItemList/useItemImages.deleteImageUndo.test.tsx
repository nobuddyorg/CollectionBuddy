// @vitest-environment jsdom
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  deleteImageRow,
  listImagesForItems,
  removeImageObjects,
} from '../../data/images';
import {
  acceptConfirmation,
  entry,
  renderItemImages,
  resetImageTestState,
  row,
  signsEverything,
  withOnePhotograph,
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

describe('useItemImages deleteImage undo', () => {
  const image = entry('img-1', 'item-1');

  beforeEach(() => {
    resetImageTestState();
    signsEverything();
  });

  it('puts the photograph back when undo is used', async () => {
    const { result } = await withOnePhotograph();

    act(() => {
      void result.current.deleteImage('item-1', image);
    });
    await acceptConfirmation();
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));

    expect(result.current.images['item-1']).toEqual([image]);
    expect(removeImageObjects).not.toHaveBeenCalled();
    expect(deleteImageRow).not.toHaveBeenCalled();
  });

  describe('with several photographs on the same entry', () => {
    const imageA = entry('img-a', 'item-1');
    const imageB = entry('img-b', 'item-1');
    const imageC = entry('img-c', 'item-1');

    async function withThreePhotographs() {
      vi.mocked(listImagesForItems).mockResolvedValue({
        data: [
          row('img-a', 'item-1'),
          row('img-b', 'item-1'),
          row('img-c', 'item-1'),
        ],
        error: null,
      });
      const hook = renderItemImages();
      await act(async () => {
        await hook.result.current.refreshAllImages(['item-1']);
      });
      return hook;
    }

    it('removes only the middle photograph, leaving the others untouched', async () => {
      const { result } = await withThreePhotographs();

      act(() => {
        void result.current.deleteImage('item-1', imageB);
      });
      await acceptConfirmation();

      expect(result.current.images['item-1']).toEqual([imageA, imageC]);
    });

    it('restores a deleted middle photograph to its original position on undo', async () => {
      const { result } = await withThreePhotographs();

      act(() => {
        void result.current.deleteImage('item-1', imageB);
      });
      await acceptConfirmation();
      await userEvent.click(
        await screen.findByRole('button', { name: 'Undo' }),
      );

      expect(result.current.images['item-1']).toEqual([imageA, imageB, imageC]);
    });
  });
});

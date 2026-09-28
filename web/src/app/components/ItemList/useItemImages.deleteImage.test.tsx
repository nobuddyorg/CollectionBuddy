// @vitest-environment jsdom
import { act, screen, waitFor } from '@testing-library/react';
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

import {
  createSignedUrls,
  deleteImageRow,
  listImagesForItems,
  removeImageObjects,
} from '../../data/images';
import {
  acceptConfirmation,
  commitDeferredDelete,
} from '../providers.test-support';
import { clearImageCache } from './imageCache';
import {
  entry,
  installDefaultImageMocks,
  renderItemImages,
  row,
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
    listImagesForItems: vi.fn(),
    removeImageObjects: vi.fn(),
    uploadImageObject: vi.fn(),
  };
});

describe('useItemImages deleteImage', () => {
  const image = entry('img-1', 'item-1');
  let consoleErrorSpy: MockInstance<typeof console.error>;

  beforeEach(() => {
    installDefaultImageMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('tolerates deleting a photo for an item with no tracked images yet', async () => {
    vi.mocked(removeImageObjects).mockResolvedValue({ error: null } as never);
    vi.mocked(deleteImageRow).mockResolvedValue({
      data: { id: 'img-1' },
      error: null,
    } as never);
    const { result } = renderItemImages();

    act(() => {
      void result.current.deleteImage('item-1', image);
    });
    await acceptConfirmation();
    expect(result.current.images['item-1']).toEqual([]);
    expect(createSignedUrls).not.toHaveBeenCalled();

    await commitDeferredDelete();
    expect(deleteImageRow).toHaveBeenCalledWith({
      id: 'img-1',
      itemId: 'item-1',
    });
  });

  it('tolerates undo for an item with no tracked images yet', async () => {
    vi.mocked(removeImageObjects).mockResolvedValue({ error: null } as never);
    vi.mocked(deleteImageRow).mockResolvedValue({
      data: null,
      error: new Error('rls'),
    } as never);
    const { result } = renderItemImages();

    act(() => {
      void result.current.deleteImage('item-1', image);
    });
    await acceptConfirmation();
    await commitDeferredDelete();

    expect(result.current.images['item-1']).toEqual([image]);
  });

  it('keeps the photograph when the confirmation is declined', async () => {
    const { result } = await withOnePhotograph();

    act(() => {
      void result.current.deleteImage('item-1', image);
    });
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      'Delete this photograph?',
    );
    await userEvent.click(await screen.findByTestId('confirm-cancel'));

    expect(result.current.images['item-1']).toEqual([image]);
    expect(removeImageObjects).not.toHaveBeenCalled();
    expect(deleteImageRow).not.toHaveBeenCalled();
  });

  it('removes both objects before the row once the undo window closes', async () => {
    vi.mocked(removeImageObjects).mockResolvedValue({ error: null } as never);
    vi.mocked(deleteImageRow).mockResolvedValue({
      data: { id: 'img-1' },
      error: null,
    } as never);
    const withThumbnail = {
      ...image,
      pathThumb: 'uid/item-1/img-1.thumb.webp',
    };
    const { result } = await withOnePhotograph();

    act(() => {
      void result.current.deleteImage('item-1', withThumbnail);
    });
    await acceptConfirmation();
    expect(result.current.images['item-1']).toEqual([]);
    expect(removeImageObjects).not.toHaveBeenCalled();

    await commitDeferredDelete();

    expect(removeImageObjects).toHaveBeenCalledWith([
      'uid/item-1/img-1.webp',
      'uid/item-1/img-1.thumb.webp',
    ]);
    expect(deleteImageRow).toHaveBeenCalledWith({
      id: 'img-1',
      itemId: 'item-1',
    });
    expect(
      vi.mocked(removeImageObjects).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(deleteImageRow).mock.invocationCallOrder[0]);
  });

  it('keeps the row and puts the photograph back when its objects cannot be removed', async () => {
    const removeError = new Error('storage down');
    vi.mocked(removeImageObjects).mockResolvedValue({
      error: removeError,
    } as never);
    const { result } = await withOnePhotograph();

    act(() => {
      void result.current.deleteImage('item-1', image);
    });
    await acceptConfirmation();
    await commitDeferredDelete();

    expect(removeImageObjects).toHaveBeenCalledWith(['uid/item-1/img-1.webp']);
    expect(deleteImageRow).not.toHaveBeenCalled();
    expect(result.current.images['item-1']).toEqual([image]);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not delete this image. Please try again.',
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith('delete image', removeError);
  });

  it('puts the photograph back when the row delete fails after its objects went', async () => {
    const rowError = new Error('rls');
    vi.mocked(removeImageObjects).mockResolvedValue({ error: null } as never);
    vi.mocked(deleteImageRow).mockResolvedValue({
      data: null,
      error: rowError,
    } as never);
    const { result } = await withOnePhotograph();

    act(() => {
      void result.current.deleteImage('item-1', image);
    });
    await acceptConfirmation();
    await commitDeferredDelete();

    expect(removeImageObjects).toHaveBeenCalledWith(['uid/item-1/img-1.webp']);
    expect(result.current.images['item-1']).toEqual([image]);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not delete this image. Please try again.',
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith('delete image', rowError);
  });

  it('reports nothing when the delete succeeds cleanly', async () => {
    vi.mocked(removeImageObjects).mockResolvedValue({ error: null } as never);
    vi.mocked(deleteImageRow).mockResolvedValue({
      data: { id: 'img-1' },
      error: null,
    } as never);
    const { result } = await withOnePhotograph();

    act(() => {
      void result.current.deleteImage('item-1', image);
    });
    await acceptConfirmation();
    await commitDeferredDelete();

    await vi.waitFor(() => expect(deleteImageRow).toHaveBeenCalled());
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('announces the deletion by name as a polite success toast', async () => {
    const { result } = await withOnePhotograph();

    act(() => {
      void result.current.deleteImage('item-1', image);
    });
    await acceptConfirmation();

    expect(await screen.findByTestId('toast')).toHaveTextContent(
      'Image deleted.',
    );
  });

  describe('when the delete moves a photograph up onto the plates', () => {
    // Signing covers only the first five plates, so a sixth photograph starts out unsigned.
    async function withPhotographs(count: number) {
      vi.mocked(listImagesForItems).mockResolvedValue({
        data: Array.from({ length: count }, (_, i) =>
          row(`img-${i}`, 'item-1'),
        ),
        error: null,
      });
      const hook = renderItemImages();
      await act(async () => {
        await hook.result.current.refreshAllImages(['item-1']);
      });
      vi.mocked(createSignedUrls).mockClear();
      return hook;
    }

    function signed(count: number) {
      return Array.from({ length: count }, (_, i) =>
        entry(`img-${i}`, 'item-1'),
      );
    }

    it('signs the photograph that moves up onto the last plate', async () => {
      const { result } = await withPhotographs(6);
      expect(result.current.images['item-1'][5].urlFull).toBeUndefined();

      act(() => {
        void result.current.deleteImage('item-1', entry('img-0', 'item-1'));
      });
      await acceptConfirmation();

      await waitFor(() =>
        expect(result.current.images['item-1']).toEqual(signed(6).slice(1)),
      );
      expect(createSignedUrls).toHaveBeenCalledExactlyOnceWith([
        'uid/item-1/img-5.webp',
      ]);
    });

    it('asks for no signature when the photograph deleted was past the plates', async () => {
      const { result } = await withPhotographs(7);
      const seventh = result.current.images['item-1'][6];
      // Emptied, so a signing the delete asked for would have to reach Storage.
      clearImageCache();

      act(() => {
        void result.current.deleteImage('item-1', seventh);
      });
      await acceptConfirmation();
      await screen.findByTestId('toast');

      expect(result.current.images['item-1']).toHaveLength(6);
      expect(createSignedUrls).not.toHaveBeenCalled();
    });

    it('asks for no signature when every plate left is signed', async () => {
      const { result } = await withPhotographs(5);
      // Emptied, so a signing the delete asked for would have to reach Storage.
      clearImageCache();

      act(() => {
        void result.current.deleteImage('item-1', entry('img-0', 'item-1'));
      });
      await acceptConfirmation();
      await screen.findByTestId('toast');

      expect(result.current.images['item-1']).toEqual(signed(5).slice(1));
      expect(createSignedUrls).not.toHaveBeenCalled();
    });

    it('keeps a photograph put back by Undo while the one moving up is signed', async () => {
      const { result } = await withPhotographs(6);
      let finishSigning = () => {};
      vi.mocked(createSignedUrls).mockImplementationOnce(
        (paths: string[]) =>
          new Promise((resolve) => {
            finishSigning = () =>
              resolve({
                data: paths.map((path) => ({
                  path,
                  signedUrl: `signed://${path}`,
                })),
                error: null,
              });
          }) as never,
      );

      act(() => {
        void result.current.deleteImage('item-1', entry('img-0', 'item-1'));
      });
      await acceptConfirmation();
      await userEvent.click(
        await screen.findByRole('button', { name: 'Undo' }),
      );
      act(() => finishSigning());

      await waitFor(() =>
        expect(result.current.images['item-1']).toEqual(signed(6)),
      );
    });
  });
});

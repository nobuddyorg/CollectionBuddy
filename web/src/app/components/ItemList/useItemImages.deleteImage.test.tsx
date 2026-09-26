// @vitest-environment jsdom
import { act, screen } from '@testing-library/react';
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

import { deleteImageRow, removeImageObjects } from '../../data/images';
import {
  acceptConfirmation,
  entry,
  installDefaultImageMocks,
  renderItemImages,
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

// The delete waits out the toast's undo window; closing the toast commits it, the same as expiry.
async function commitDeferredDelete() {
  await screen.findByRole('status');
  await userEvent.click(screen.getByRole('button', { name: 'Close' }));
}

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

    await commitDeferredDelete();
    expect(deleteImageRow).toHaveBeenCalledWith('img-1');
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
    expect(deleteImageRow).toHaveBeenCalledWith('img-1');
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

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Image deleted.',
    );
  });
});

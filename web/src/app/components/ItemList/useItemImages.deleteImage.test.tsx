// @vitest-environment jsdom
import { act, renderHook, screen } from '@testing-library/react';
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
import {
  createSignedUrls,
  deleteImageRow,
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

async function acceptConfirmation() {
  await userEvent.click(await screen.findByTestId('confirm-accept'));
}

// The delete waits out the toast's undo window; closing the toast commits it, the same as expiry.
async function commitDeferredDelete() {
  await screen.findByRole('status');
  await userEvent.click(screen.getByRole('button', { name: 'Close' }));
}

describe('useItemImages deleteImage', () => {
  const image = entry('img-1', 'item-1');
  let consoleErrorSpy: MockInstance<typeof console.error>;

  beforeEach(() => {
    vi.clearAllMocks();
    clearImageCache();
    window.localStorage.setItem('lang', 'en');
    vi.mocked(listImagesForItems).mockResolvedValue({
      data: [],
      error: null,
    });
    signsEverything();
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
      void result.current.deleteImage('item-1', image);
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
      void result.current.deleteImage('item-1', image);
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

  it('puts the photograph back when the row delete fails', async () => {
    vi.mocked(deleteImageRow).mockResolvedValue({
      data: null,
      error: new Error('rls'),
    } as never);
    const { result } = await withOnePhotograph();

    act(() => {
      void result.current.deleteImage('item-1', image);
    });
    await acceptConfirmation();
    await commitDeferredDelete();

    expect(result.current.images['item-1']).toEqual([image]);
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
      void result.current.deleteImage('item-1', image);
    });
    await acceptConfirmation();
    await commitDeferredDelete();

    expect(removeImageObjects).toHaveBeenCalledWith(['uid/item-1/img-1.webp']);
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
      void result.current.deleteImage('item-1', image);
    });
    await acceptConfirmation();
    await commitDeferredDelete();

    expect(result.current.images['item-1']).toEqual([image]);
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
      void result.current.deleteImage('item-1', image);
    });
    await acceptConfirmation();
    await commitDeferredDelete();

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

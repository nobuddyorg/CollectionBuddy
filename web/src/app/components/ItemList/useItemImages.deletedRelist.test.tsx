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
  commitDeferredDelete,
} from '../providers.test-support';
import {
  acceptsUploads,
  entry,
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
    listImagesForItems: vi.fn(),
    removeImageObjects: vi.fn(),
    uploadImageObject: vi.fn(),
  };
});

// The real one needs a canvas and a Worker; the bytes don't matter here.
vi.mock('../../lib/imageCompression', () => ({
  compressPhoto: vi.fn(
    async (file: File) =>
      new File(['compressed'], file.name, { type: 'image/webp' }),
  ),
}));

// The row outlives its toast's undo window, so every listing in that window still carries it.
function listsDeletedAndNew() {
  vi.mocked(listImagesForItems).mockResolvedValue({
    data: [row('img-1', 'item-1'), row('img-new', 'item-1')],
    error: null,
  });
}

describe('useItemImages re-listing around a photograph delete', () => {
  const deleted = entry('img-1', 'item-1');

  beforeEach(() => {
    resetImageTestState();
    signsEverything();
    acceptsUploads();
  });

  async function deletedInsideUndoWindow() {
    const hook = await withOnePhotograph();
    act(() => {
      void hook.result.current.deleteImage('item-1', deleted);
    });
    await acceptConfirmation();
    listsDeletedAndNew();
    return hook;
  }

  it('keeps it gone when another photograph is uploaded inside its undo window', async () => {
    const { result } = await deletedInsideUndoWindow();

    await act(async () => {
      await result.current.uploadImage('item-1', {
        file: new File(['x'], 'photo.jpg', { type: 'image/jpeg' }),
      });
    });

    expect(result.current.images['item-1']).toEqual([
      entry('img-new', 'item-1'),
    ]);
  });

  it('keeps it gone when the page re-lists inside its undo window', async () => {
    const { result } = await deletedInsideUndoWindow();

    await act(async () => {
      await result.current.refreshAllImages(['item-1']);
    });

    expect(result.current.images['item-1']).toEqual([
      entry('img-new', 'item-1'),
    ]);
  });

  it('keeps it gone once committed, even from a listing read before the commit', async () => {
    vi.mocked(removeImageObjects).mockResolvedValue({ error: null } as never);
    vi.mocked(deleteImageRow).mockResolvedValue({
      data: { id: 'img-1' },
      error: null,
    } as never);
    const { result } = await deletedInsideUndoWindow();
    await commitDeferredDelete();

    await act(async () => {
      await result.current.showImages(['item-1'], [row('img-1', 'item-1')]);
    });

    expect(result.current.images['item-1']).toEqual([]);
  });

  it('lists it again after undo', async () => {
    const { result } = await deletedInsideUndoWindow();
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));

    await act(async () => {
      await result.current.refreshAllImages(['item-1']);
    });

    expect(result.current.images['item-1']).toEqual([
      deleted,
      entry('img-new', 'item-1'),
    ]);
  });

  it('lists it again after its delete failed', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    vi.mocked(removeImageObjects).mockResolvedValue({ error: null } as never);
    vi.mocked(deleteImageRow).mockResolvedValue({
      data: null,
      error: new Error('rls'),
    } as never);
    const { result } = await deletedInsideUndoWindow();
    await commitDeferredDelete();
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalled());

    await act(async () => {
      await result.current.refreshAllImages(['item-1']);
    });

    expect(result.current.images['item-1']).toEqual([
      deleted,
      entry('img-new', 'item-1'),
    ]);
    consoleError.mockRestore();
  });
});

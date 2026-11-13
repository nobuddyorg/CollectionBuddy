// @vitest-environment jsdom
import { act, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createImageRow,
  deleteImageRow,
  listImagesForItems,
  readImageCreatedAt,
  removeImageObjects,
  uploadImageObject,
} from '../../data/images';
import {
  acceptsUploads,
  installDefaultImageMocks,
  renderItemImages,
} from './useItemImages.test-support';
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
    listImagesForItems: vi.fn(),
    readImageCreatedAt: vi.fn(),
    removeImageObjects: vi.fn(),
    uploadImageObject: vi.fn(),
  };
});

// The real one probes a canvas and needs a Worker; each size comes back as WebP.
vi.mock('../../lib/imageCompression', () => ({
  compressPhoto: vi.fn(
    async (file: File, { maxWidthOrHeight }: { maxWidthOrHeight: number }) =>
      new File([`compressed-${maxWidthOrHeight}`], file.name, {
        type: 'image/webp',
      }),
  ),
}));

const OLD_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const AFTER_OLD_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae8';
const ADDED = '2026-01-02T03:04:05.678Z';

const old: ImageEntry = {
  id: OLD_ID,
  pathFull: `uid/item-1/${OLD_ID}.webp`,
  urlFull: 'signed://old',
  pathThumb: `uid/item-1/${OLD_ID}.thumb.webp`,
  urlThumb: 'signed://old-thumb',
};
const cutout = {
  file: new File(['png'], 'cutout.png', { type: 'image/png' }),
  encoding: 'transparent' as const,
};

function addedAt(createdAt: string) {
  vi.mocked(readImageCreatedAt).mockResolvedValue({
    data: { created_at: createdAt },
    error: null,
  } as never);
}

function removesFine() {
  vi.mocked(removeImageObjects).mockResolvedValue({ error: null } as never);
  vi.mocked(deleteImageRow).mockResolvedValue({ error: null });
}

async function replace() {
  const hook = renderItemImages();
  await act(async () => {
    await hook.result.current.replaceImage('item-1', old, cutout);
  });
  return hook;
}

describe('useItemImages replaceImage', () => {
  beforeEach(() => {
    installDefaultImageMocks();
    acceptsUploads();
    addedAt(ADDED);
    removesFine();
  });

  it("puts the new photo in the old one's place: its time, and the id just after its own", async () => {
    await replace();

    expect(readImageCreatedAt).toHaveBeenCalledWith(OLD_ID);
    expect(createImageRow).toHaveBeenCalledOnce();
    const [inserted] = vi.mocked(createImageRow).mock.calls[0];
    expect(inserted).toMatchObject({
      item_id: 'item-1',
      id: AFTER_OLD_ID,
      created_at: ADDED,
    });
    expect(inserted.path_full).toMatch(/^uid\/item-1\/[0-9a-f-]+\.webp$/);
    expect(inserted.path_thumb).toMatch(
      /^uid\/item-1\/[0-9a-f-]+\.thumb\.webp$/,
    );
  });

  it('removes the old bytes, then the old row, only once the new row is in', async () => {
    await replace();

    expect(removeImageObjects).toHaveBeenCalledWith([
      old.pathFull,
      old.pathThumb,
    ]);
    expect(deleteImageRow).toHaveBeenCalledWith({
      id: OLD_ID,
      itemId: 'item-1',
    });
    const inserted = vi.mocked(createImageRow).mock.invocationCallOrder[0];
    const removed = vi.mocked(removeImageObjects).mock.invocationCallOrder[0];
    const deleted = vi.mocked(deleteImageRow).mock.invocationCallOrder[0];
    expect(inserted).toBeLessThan(removed);
    expect(removed).toBeLessThan(deleted);
  });

  it('shows the entry as it is listed afterwards', async () => {
    vi.mocked(listImagesForItems).mockResolvedValue({
      data: [
        {
          id: AFTER_OLD_ID,
          item_id: 'item-1',
          path_full: 'uid/item-1/new.png',
          path_thumb: null,
        },
      ],
      error: null,
    });

    const { result } = await replace();

    expect(result.current.images['item-1'].map((entry) => entry.id)).toEqual([
      AFTER_OLD_ID,
    ]);
  });

  it('leaves the old photo alone when the new one cannot be stored', async () => {
    vi.mocked(uploadImageObject).mockResolvedValue({
      error: new Error('Storage is down'),
    } as never);

    await replace();

    expect(createImageRow).not.toHaveBeenCalled();
    expect(removeImageObjects).not.toHaveBeenCalled();
    expect(deleteImageRow).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not upload this image.',
    );
  });

  it('leaves the old photo alone when the new row is refused', async () => {
    vi.mocked(createImageRow).mockResolvedValue({
      error: new Error('row refused'),
    } as never);

    await replace();

    expect(removeImageObjects).not.toHaveBeenCalled();
    expect(deleteImageRow).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toBeVisible();
  });

  it('changes nothing when it cannot tell when the old photo was added', async () => {
    vi.mocked(readImageCreatedAt).mockResolvedValue({
      data: null,
      error: new Error('row hidden'),
    } as never);

    await replace();

    expect(uploadImageObject).not.toHaveBeenCalled();
    expect(createImageRow).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toBeVisible();
  });

  it('says the original was kept when its removal fails, rather than losing either', async () => {
    vi.mocked(removeImageObjects).mockResolvedValue({
      error: new Error('Storage refused'),
    } as never);

    await replace();

    expect(deleteImageRow).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The photo without its background was saved, but the original could not be removed.',
    );
  });

  it('shows the entry busy while it works, and not after', async () => {
    let release = () => {};
    vi.mocked(uploadImageObject).mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ error: null } as never);
        }),
    );
    const { result } = renderItemImages();

    let replacing: Promise<void> = Promise.resolve();
    act(() => {
      replacing = result.current.replaceImage('item-1', old, cutout);
    });
    await vi.waitFor(() => expect(uploadImageObject).toHaveBeenCalled());
    expect(result.current.pendingUploads['item-1']).toBe(1);

    await act(async () => {
      release();
      await vi.waitFor(() =>
        expect(uploadImageObject).toHaveBeenCalledTimes(2),
      );
      release();
      await replacing;
    });

    expect(result.current.pendingUploads['item-1']).toBeUndefined();
  });
});

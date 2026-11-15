// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PhotoUpload } from '../../data/photoType';
import type { PhotoInspection } from '../../lib/photoRotation';
import {
  defaultImagesState,
  item,
  itemsState,
  renderList,
  resetHookMocks,
} from './index.test-support';
import type { useItems } from './useItems';
import type { useItemImages } from './useItemImages';
import type { useItemMutations } from './useItemMutations';

const useItemsMock = vi.fn();
vi.mock('./useItems', () => ({
  useItems: (...args: unknown[]) =>
    useItemsMock(...args) as ReturnType<typeof useItems>,
}));

const useItemImagesMock = vi.fn();
vi.mock('./useItemImages', () => ({
  useItemImages: (...args: unknown[]) =>
    useItemImagesMock(...args) as ReturnType<typeof useItemImages>,
}));

const useItemMutationsMock = vi.fn();
vi.mock('./useItemMutations', () => ({
  useItemMutations: (...args: unknown[]) =>
    useItemMutationsMock(...args) as ReturnType<typeof useItemMutations>,
}));

// jsdom decodes no image: the inspection and the turn itself are stand-ins.
const rotation = vi.hoisted(() => ({
  inspectForRotation: vi.fn<(file: Blob) => Promise<PhotoInspection>>(),
  rotatePhoto: vi.fn<(file: Blob, degrees: number) => Promise<PhotoUpload>>(),
}));
vi.mock('../../lib/photoRotation', () => rotation);

// No model in tests: the crop itself is a stand-in.
const cropToObject = vi.hoisted(() => vi.fn());
vi.mock('../BackgroundRemoval/load', () => ({
  loadBackgroundRemoval: async () => ({
    cropToObject,
    NoObjectFoundError: class extends Error {},
  }),
  loadCutoutReview: () => import('../BackgroundRemoval/CutoutReview'),
}));

const downloadImageObject = vi.hoisted(() => vi.fn());
vi.mock('../../data/images', async (importActual) => ({
  ...(await importActual<typeof import('../../data/images')>()),
  downloadImageObject,
}));

const stored = {
  id: 'img-1',
  pathFull: '1/1.webp',
  urlFull: 'https://example.com/1.webp',
};
const source = new Blob(['stored'], { type: 'image/webp' });
const rotated: PhotoUpload = {
  file: new File(['png'], 'rotated.png', { type: 'image/png' }),
  encoding: 'opaque',
};

beforeEach(() => {
  resetHookMocks({ useItemsMock, useItemImagesMock, useItemMutationsMock });
  useItemsMock.mockReturnValue(itemsState({ items: [item('1')], total: 1 }));
  downloadImageObject
    .mockReset()
    .mockResolvedValue({ data: source, error: null });
  rotation.inspectForRotation.mockReset().mockResolvedValue({
    transparent: false,
    straightening: { kind: 'none' },
  });
  rotation.rotatePhoto.mockReset().mockResolvedValue(rotated);
  cropToObject.mockReset();
  localStorage.removeItem('removeBackground');
  vi.stubGlobal(
    'URL',
    Object.assign(URL, {
      createObjectURL: () => 'blob:crop',
      revokeObjectURL: () => {},
    }),
  );
});

describe('ItemList rotation', () => {
  it('turns a stored photo from the viewer and replaces it in place', async () => {
    const replaceImage = vi.fn(async () => {});
    useItemImagesMock.mockReturnValue({
      ...defaultImagesState(),
      images: { '1': [stored] },
      replaceImage,
    });
    renderList();

    await userEvent.click(screen.getByAltText('Item 1, image 1'));
    const viewer = screen.getByRole('dialog', { name: 'Full size image' });
    await userEvent.click(
      within(viewer).getByRole('button', { name: 'Rotate' }),
    );
    await userEvent.click(
      within(viewer).getByRole('button', { name: 'Rotate right' }),
    );
    const save = within(viewer).getByRole('button', { name: 'Save' });
    await vi.waitFor(() => expect(save).toBeEnabled());
    await userEvent.click(save);

    await vi.waitFor(() =>
      expect(replaceImage).toHaveBeenCalledExactlyOnceWith(
        '1',
        stored,
        rotated,
      ),
    );
    expect(downloadImageObject).toHaveBeenCalledWith('1/1.webp');
    expect(rotation.rotatePhoto).toHaveBeenCalledWith(source, 90);
    // The viewer stays on the photo; the replaced one arrives in its place.
    expect(
      screen.getByRole('dialog', { name: 'Full size image' }),
    ).toBeInTheDocument();
  });

  it('offers no rotation to a viewer of a shared collection', async () => {
    useItemImagesMock.mockReturnValue({
      ...defaultImagesState(),
      images: { '1': [stored] },
    });
    renderList({ canEdit: false });

    await userEvent.click(screen.getByAltText('Item 1, image 1'));

    expect(screen.queryByRole('button', { name: 'Rotate' })).toBeNull();
  });
});

describe('ItemList crop', () => {
  it('crops a stored photo to its item from the viewer and replaces it in place', async () => {
    localStorage.setItem('removeBackground', 'on');
    const crop = {
      blob: new Blob(['png'], { type: 'image/png' }),
      width: 400,
      height: 300,
      transparent: true,
    };
    cropToObject.mockResolvedValue({ kind: 'cropped', crop });
    const replaceImage = vi.fn(async () => {});
    useItemImagesMock.mockReturnValue({
      ...defaultImagesState(),
      images: { '1': [stored] },
      replaceImage,
    });
    renderList();

    await userEvent.click(screen.getByAltText('Item 1, image 1'));
    const viewer = screen.getByRole('dialog', { name: 'Full size image' });
    await userEvent.click(
      within(viewer).getByRole('button', { name: 'Crop to the item' }),
    );
    const save = within(viewer).getByRole('button', { name: 'Save' });
    await vi.waitFor(() => expect(save).toBeEnabled());
    await userEvent.click(save);

    await vi.waitFor(() => expect(replaceImage).toHaveBeenCalledOnce());
    expect(replaceImage).toHaveBeenCalledWith(
      '1',
      stored,
      expect.objectContaining({ encoding: 'transparent' }),
    );
    expect(cropToObject.mock.calls[0][0]).toBe(source);
  });

  it('offers no crop while background removal is off', async () => {
    useItemImagesMock.mockReturnValue({
      ...defaultImagesState(),
      images: { '1': [stored] },
    });
    renderList();

    await userEvent.click(screen.getByAltText('Item 1, image 1'));

    expect(
      screen.queryByRole('button', { name: 'Crop to the item' }),
    ).toBeNull();
  });
});

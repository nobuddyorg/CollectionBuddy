// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

// The three data hooks are tested on their own; mocked here to drive exactly what the grid paints.
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

beforeEach(() => {
  resetHookMocks({ useItemsMock, useItemImagesMock, useItemMutationsMock });
});

describe('ItemList image carousel', () => {
  function imagesFor(itemId: string) {
    return {
      [itemId]: [
        {
          id: 'img-1',
          pathFull: `${itemId}/1.webp`,
          urlFull: 'https://example.com/1.webp',
        },
        {
          id: 'img-2',
          pathFull: `${itemId}/2.webp`,
          urlFull: 'https://example.com/2.webp',
        },
      ],
    };
  }

  beforeEach(() => {
    useItemsMock.mockReturnValue(itemsState({ items: [item('1')], total: 1 }));
  });

  it('opens on a thumbnail, navigates, deletes the shown photo, and closes', async () => {
    const deleteImage = vi.fn();
    useItemImagesMock.mockReturnValue({
      ...defaultImagesState(),
      images: imagesFor('1'),
      deleteImage,
    });

    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByAltText('Item 1, image 1'));
    const dialog = screen.getByRole('dialog', { name: 'Full size image' });
    expect(dialog).toBeVisible();

    await user.click(
      within(dialog).getByRole('button', { name: 'Next image' }),
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Delete image' }),
    );
    expect(deleteImage).toHaveBeenCalledWith(
      '1',
      expect.objectContaining({ id: 'img-2' }),
    );

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('ItemList photographs for the page', () => {
  const rows = [
    { id: 'p1', item_id: 'a', path_full: 'u/a/p1.webp', path_thumb: null },
  ];

  it('signs the rows the page read carried, rather than listing them again', () => {
    const images = defaultImagesState();
    useItemImagesMock.mockReturnValue(images);
    useItemsMock.mockReturnValue(
      itemsState({
        items: [item('a'), item('b')],
        total: 2,
        pageImages: { itemIdsKey: 'a,b', rows },
      }),
    );

    renderList();

    expect(images.showImages).toHaveBeenCalledWith(['a', 'b'], rows);
    expect(images.refreshAllImages).not.toHaveBeenCalled();
  });

  it('lists the photographs itself when the carried rows are for other items', () => {
    const images = defaultImagesState();
    useItemImagesMock.mockReturnValue(images);
    useItemsMock.mockReturnValue(
      itemsState({
        items: [item('b')],
        total: 1,
        pageImages: { itemIdsKey: 'a,b', rows },
      }),
    );

    renderList();

    expect(images.refreshAllImages).toHaveBeenCalledWith(['b']);
    expect(images.showImages).not.toHaveBeenCalled();
  });

  it('asks for no photographs for an empty page', () => {
    const images = defaultImagesState();
    useItemImagesMock.mockReturnValue(images);
    useItemsMock.mockReturnValue(itemsState());

    renderList();

    expect(images.refreshAllImages).not.toHaveBeenCalled();
    expect(images.showImages).not.toHaveBeenCalled();
  });
});

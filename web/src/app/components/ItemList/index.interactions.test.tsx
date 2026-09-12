// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import { ConfirmProvider } from '../Confirm/ConfirmProvider';
import ItemList from './index';
import type { ItemLite, ImgEntry } from './types';
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

vi.mock('../Map/usePlaces', () => ({
  usePlaces: () => ({ places: [], loading: false, error: false }),
}));

const ITEM: ItemLite = {
  id: 'item-1',
  title: 'Seated Dime',
  description: null,
  place: null,
  place_lat: null,
  place_lng: null,
  tags: [],
};

const PHOTO: ImgEntry = {
  id: 'img-1',
  pathFull: 'uid/item-1/a.webp',
  urlFull: 'https://signed/a',
  pathThumb: undefined,
  urlThumb: undefined,
};

function imagesState(overrides: Record<string, unknown> = {}) {
  return {
    images: { 'item-1': [PHOTO] } as Record<string, ImgEntry[]>,
    loadingItems: new Set<string>(),
    refreshAllImages: vi.fn(),
    uploadImage: vi.fn(),
    deleteImage: vi.fn(),
    captureItemImagePaths: vi.fn().mockResolvedValue([]),
    removeImageBytes: vi.fn(),
    pendingUploads: {} as Record<string, number>,
    ...overrides,
  };
}

// A card only shows its caption and actions once its hero photograph has
// loaded, which in jsdom only ever happens on request.
async function heroLoads() {
  fireEvent.load(await screen.findByRole('img'));
}

function renderList(props: Partial<Parameters<typeof ItemList>[0]> = {}) {
  return render(
    <I18nProvider>
      <ToastProvider>
        <ConfirmProvider>
          <ItemList categoryId="cat-1" canEdit={true} {...props} />
        </ConfirmProvider>
      </ToastProvider>
    </I18nProvider>,
  );
}

describe('the catalogue grid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('lang', 'en');
    useItemsMock.mockReturnValue({
      items: [ITEM],
      total: 1,
      loading: false,
      page: 1,
      setPage: vi.fn(),
      totalPages: 1,
      reload: vi.fn(),
      setItems: vi.fn(),
    });
    useItemImagesMock.mockReturnValue(imagesState());
    useItemMutationsMock.mockReturnValue({
      saveEdit: vi.fn(),
      isSaving: false,
      removeItem: vi.fn(),
    });
  });

  it('hands a picked photograph to the entry it was picked for', async () => {
    const uploadImage = vi.fn();
    useItemImagesMock.mockReturnValue(imagesState({ uploadImage }));
    renderList();

    await heroLoads();
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    await userEvent.upload(screen.getByLabelText('Add image'), file);

    expect(uploadImage).toHaveBeenCalledWith('item-1', file);
  });

  it('deletes the entry the delete button belongs to', async () => {
    const removeItem = vi.fn();
    useItemMutationsMock.mockReturnValue({
      saveEdit: vi.fn(),
      isSaving: false,
      removeItem,
    });
    renderList();
    await heroLoads();

    await userEvent.click(screen.getByTestId('delete-entry'));

    expect(removeItem).toHaveBeenCalledWith('item-1');
  });

  it('deletes a photograph against the entry it hangs on', async () => {
    const deleteImage = vi.fn();
    useItemImagesMock.mockReturnValue(imagesState({ deleteImage }));
    renderList();
    await heroLoads();

    await userEvent.click(screen.getByRole('button', { name: 'Delete image' }));

    expect(deleteImage).toHaveBeenCalledWith('item-1', PHOTO);
  });

  it('opens the editor for the entry and closes it again', async () => {
    renderList();
    await heroLoads();

    await userEvent.click(screen.getByTestId('edit-entry'));
    const dialog = await screen.findByRole('dialog');
    // The form itself is a lazy chunk, so the dialog frame arrives first.
    expect(
      await within(dialog).findByDisplayValue('Seated Dime'),
    ).toBeVisible();

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Close' }),
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the new-entry dialog from its own close button', async () => {
    renderList();

    await userEvent.click(screen.getByRole('button', { name: 'New entry' }));
    const dialog = await screen.findByRole('dialog');

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Close' }),
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

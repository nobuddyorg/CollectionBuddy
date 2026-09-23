// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import { ConfirmProvider } from '../Confirm/ConfirmProvider';
import { createItem, linkItemToCategory } from '../../data/items';
import ItemList from './index';
import type { ItemLite } from './types';
import type { useItems } from './useItems';
import type { useItemImages } from './useItemImages';
import type { useItemMutations } from './useItemMutations';

vi.mock('../../data/items', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/items')>()),
  createItem: vi.fn(),
  linkItemToCategory: vi.fn(),
}));

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

function defaultMutationsState() {
  return {
    saveEdit: vi.fn(),
    isSaving: false,
    removeItem: vi.fn(),
  };
}

beforeEach(() => {
  window.localStorage.setItem('lang', 'en');
  useItemsMock.mockReset();
  useItemImagesMock.mockReset().mockReturnValue({
    images: {} as Record<string, unknown>,
    loadingItems: new Set<string>(),
    refreshAllImages: vi.fn(),
    showImages: vi.fn(),
    signAllFor: vi.fn(),
    uploadImage: vi.fn(),
    deleteImage: vi.fn(),
    captureItemImagePaths: vi.fn(),
    removeImageBytes: vi.fn(),
    pendingUploads: {} as Record<string, number>,
  });
  useItemMutationsMock.mockReset().mockReturnValue(defaultMutationsState());
});

const item = (id: string): ItemLite => ({
  id,
  title: `Item ${id}`,
  description: null,
  place: null,
  place_lat: null,
  place_lng: null,
  tags: [],
});

function itemsState(overrides: Partial<ReturnType<typeof defaultState>> = {}) {
  return { ...defaultState(), ...overrides };
}

function defaultState() {
  return {
    items: [] as ItemLite[],
    pageImages: null,
    total: 0,
    loading: false,
    page: 1,
    setPage: vi.fn(),
    totalPages: 1,
    reload: vi.fn(),
    setItems: vi.fn(),
  };
}

function renderList() {
  return render(
    <I18nProvider>
      <ToastProvider>
        <ConfirmProvider>
          <ItemList categoryId="cat-1" canEdit={true} />
        </ConfirmProvider>
      </ToastProvider>
    </I18nProvider>,
  );
}

describe('ItemList create flow', () => {
  beforeEach(() => {
    vi.mocked(createItem).mockReset();
    vi.mocked(linkItemToCategory).mockReset();
    vi.mocked(createItem).mockResolvedValue({
      data: { id: 'item-2' },
      error: null,
    } as never);
    vi.mocked(linkItemToCategory).mockResolvedValue({ error: null } as never);
  });

  async function createEntry() {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByTestId('new-entry'));
    await user.type(await screen.findByTestId('item-title'), 'Roman coin');
    await user.click(screen.getByRole('button', { name: 'Add' }));
  }

  it('reloads the current page when a new entry is created from page 1', async () => {
    const reload = vi.fn();
    const setPage = vi.fn();
    useItemsMock.mockReturnValue(
      itemsState({ items: [item('1')], total: 1, page: 1, reload, setPage }),
    );

    await createEntry();

    expect(createItem).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Roman coin' }),
    );
    expect(linkItemToCategory).toHaveBeenCalledWith('item-2', 'cat-1');
    expect(reload).toHaveBeenCalled();
    expect(setPage).not.toHaveBeenCalled();
  });

  it('jumps back to page 1 when a new entry is created from a later page', async () => {
    const reload = vi.fn();
    const setPage = vi.fn();
    useItemsMock.mockReturnValue(
      itemsState({
        items: [item('1')],
        total: 20,
        page: 2,
        totalPages: 3,
        reload,
        setPage,
      }),
    );

    await createEntry();

    expect(setPage).toHaveBeenCalledWith(1);
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('ItemList map modal', () => {
  beforeEach(() => {
    useItemsMock.mockReturnValue(itemsState({ items: [item('1')], total: 1 }));
  });

  it('opens the map from the toolbar button', async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByTestId('open-map'));

    expect(
      await screen.findByRole('dialog', { name: 'Map of Collectibles' }),
    ).toBeVisible();
  });
});

describe('ItemList edit flow', () => {
  beforeEach(() => {
    useItemsMock.mockReturnValue(itemsState({ items: [item('1')], total: 1 }));
  });

  it('closes the edit modal once the save succeeds', async () => {
    const saveEdit = vi.fn().mockResolvedValue(true);
    useItemMutationsMock.mockReturnValue({
      ...defaultMutationsState(),
      saveEdit,
    });

    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByTestId('edit-entry'));
    const title = await screen.findByTestId('item-title');
    expect(title).toHaveValue('Item 1');
    await user.clear(title);
    await user.type(title, 'Updated title');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(saveEdit).toHaveBeenCalledWith(
      '1',
      expect.objectContaining({ title: 'Updated title' }),
    );
    await vi.waitFor(() => {
      expect(screen.queryByTestId('item-title')).not.toBeInTheDocument();
    });
  });

  it('keeps the edit modal open when the save fails', async () => {
    const saveEdit = vi.fn().mockResolvedValue(false);
    useItemMutationsMock.mockReturnValue({
      ...defaultMutationsState(),
      saveEdit,
    });

    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByTestId('edit-entry'));
    await screen.findByTestId('item-title');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(saveEdit).toHaveBeenCalled();
    expect(screen.getByTestId('item-title')).toBeInTheDocument();
  });
});

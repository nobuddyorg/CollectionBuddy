// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
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

// The three data hooks ItemList wires together are exercised on their own
// (useItems.test.tsx, useItemImages/useItemMutations internals are I/O and
// are excluded from coverage). Mocked here so this file can drive exactly
// the render sequence #305 was about -- what the grid paints for a given
// (items, total, loading) triple -- without a real Supabase round trip.
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

function defaultImagesState() {
  return {
    images: {} as Record<string, unknown>,
    loadingItems: new Set<string>(),
    refreshAllImages: vi.fn(),
    uploadImage: vi.fn(),
    deleteImage: vi.fn(),
    deleteAllItemImages: vi.fn(),
    pendingUploads: {} as Record<string, number>,
    deletingPath: new Set<string>(),
  };
}

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
  useItemImagesMock.mockReset().mockReturnValue(defaultImagesState());
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
    total: 0,
    loading: false,
    page: 1,
    setPage: vi.fn(),
    totalPages: 1,
    reload: vi.fn(),
    setItems: vi.fn(),
  };
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

describe('ItemList empty state', () => {
  beforeEach(() => {
    window.localStorage.setItem('lang', 'en');
    useItemsMock.mockReset();
  });

  it('shows "No entries yet" when the category genuinely holds nothing', () => {
    useItemsMock.mockReturnValue(
      itemsState({ items: [], total: 0, loading: false }),
    );
    renderList();
    expect(screen.getByText('No entries yet')).toBeVisible();
  });

  // Regression (#305): with 10 entries and a page size of 9, page 2 holds
  // exactly one card. Deleting it fires a silent reload for page 2, which
  // returns `items: []` alongside the corrected `total: 9` in a single
  // commit -- `page` itself only catches up to `clampPage`'s answer (page 1)
  // on the render after. `items` is empty here, but `total` says entries
  // still exist elsewhere, so this is a page correction in flight, not an
  // empty collection -- the basket must not paint over it.
  it('does not flash "No entries yet" while a page correction is pending', () => {
    useItemsMock.mockReturnValue(
      itemsState({
        items: [],
        total: 9,
        loading: false,
        page: 1,
        totalPages: 1,
      }),
    );
    renderList();
    expect(screen.queryByText('No entries yet')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeVisible();
  });

  it('shows the skeleton (not the empty state) while a normal fetch is in flight', () => {
    useItemsMock.mockReturnValue(
      itemsState({ items: [], total: 0, loading: true }),
    );
    renderList();
    expect(screen.queryByText('No entries yet')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeVisible();
  });

  it('renders the corrected page once its own fetch resolves', () => {
    useItemsMock.mockReturnValue(
      itemsState({
        items: [item('1'), item('2')],
        total: 9,
        loading: false,
        page: 1,
        totalPages: 1,
      }),
    );
    renderList();
    expect(screen.queryByText('No entries yet')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Item 1' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Item 2' })).toBeVisible();
  });
});

// #483 follow-up: a shared category is browsable but not editable. RLS
// already refuses the writes (see design-decisions.md's RLS section) --
// this checks that the controls offering them are gone, not merely
// disabled, the same way CategorySelect's owned/shared tests do. "New
// entry" is the one exception (#549): it stays mounted and disabled so the
// toolbar doesn't shrink to just the Map button.
describe('ItemList on a shared category', () => {
  beforeEach(() => {
    window.localStorage.setItem('lang', 'en');
    useItemsMock.mockReset();
    useItemsMock.mockReturnValue(itemsState({ items: [item('1')], total: 1 }));
  });

  it('disables, but does not hide, the New entry button', () => {
    renderList({ canEdit: false });
    expect(screen.getByTestId('new-entry')).toBeVisible();
    expect(screen.getByTestId('new-entry')).toBeDisabled();
  });

  it('shows an enabled New entry button for an owned or editor-shared category', () => {
    renderList({ canEdit: true });
    expect(screen.getByTestId('new-entry')).toBeVisible();
    expect(screen.getByTestId('new-entry')).toBeEnabled();
  });

  it('offers no edit, delete, or upload control on an entry', () => {
    renderList({ canEdit: false });
    expect(screen.queryByTestId('edit-entry')).not.toBeInTheDocument();
    expect(screen.queryByTestId('delete-entry')).not.toBeInTheDocument();
    expect(screen.queryByTestId('upload-photo')).not.toBeInTheDocument();
    expect(screen.queryByText('Add image')).not.toBeInTheDocument();
    expect(screen.getAllByText('No images').length).toBeGreaterThan(0);
  });

  it('still shows those controls for an owned or editor-shared category', () => {
    renderList({ canEdit: true });
    expect(screen.getByTestId('edit-entry')).toBeVisible();
    expect(screen.getByTestId('delete-entry')).toBeVisible();
    // Two: the empty-mount plate's own upload input and the action row's,
    // both real for an item with no photographs yet.
    expect(screen.getAllByTestId('upload-photo').length).toBe(2);
  });
});

describe('ItemList create flow', () => {
  beforeEach(() => {
    window.localStorage.setItem('lang', 'en');
    useItemsMock.mockReset();
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

describe('ItemList search', () => {
  beforeEach(() => {
    window.localStorage.setItem('lang', 'en');
    useItemsMock.mockReset();
    useItemsMock.mockReturnValue(itemsState({ items: [], total: 0 }));
  });

  it('clears the search term from the empty-state clear button', async () => {
    const user = userEvent.setup();
    renderList();

    await user.type(screen.getByTestId('search-input'), 'coin');
    await screen.findByText('No results for "coin"');

    const clearButtons = await screen.findAllByRole('button', {
      name: 'Clear search',
    });
    await user.click(clearButtons[clearButtons.length - 1]);

    expect(screen.getByTestId('search-input')).toHaveValue('');
  });
});

describe('ItemList map modal', () => {
  beforeEach(() => {
    window.localStorage.setItem('lang', 'en');
    useItemsMock.mockReset();
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
    window.localStorage.setItem('lang', 'en');
    useItemsMock.mockReset();
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
    window.localStorage.setItem('lang', 'en');
    useItemsMock.mockReset();
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

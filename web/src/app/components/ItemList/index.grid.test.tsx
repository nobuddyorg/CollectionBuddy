// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import { ConfirmProvider } from '../Confirm/ConfirmProvider';
import ItemList from './index';
import type { ItemLite } from './types';
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
  useItemMutationsMock.mockReset().mockReturnValue({
    saveEdit: vi.fn(),
    isSaving: false,
    removeItem: vi.fn(),
  });
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
  it('shows "No entries yet" when the category genuinely holds nothing', () => {
    useItemsMock.mockReturnValue(
      itemsState({ items: [], total: 0, loading: false }),
    );
    renderList();
    expect(screen.getByText('No entries yet')).toBeVisible();
  });

  // Deleting page 2's only card reloads it as items: [] with total: 9; the basket must not paint over that.
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

describe('ItemList grid while a refetch is in flight', () => {
  // The grid dims rather than being replaced by a skeleton once entries already exist.
  it('dims the grid while re-fetching a page that already has entries', () => {
    useItemsMock.mockReturnValue(
      itemsState({ items: [item('1')], total: 1, loading: true }),
    );
    renderList();
    expect(screen.getByRole('list')).toHaveClass('opacity-60');
  });

  it('leaves the grid at full opacity once loading finishes', () => {
    useItemsMock.mockReturnValue(
      itemsState({ items: [item('1')], total: 1, loading: false }),
    );
    renderList();
    expect(screen.getByRole('list')).not.toHaveClass('opacity-60');
  });
});

// Controls that write are gone, not disabled; "New entry" alone stays mounted and disabled.
describe('ItemList on a shared category', () => {
  beforeEach(() => {
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
    // Two: the empty mount's own upload input and the action row's.
    expect(screen.getAllByTestId('upload-photo').length).toBe(2);
  });
});

describe('ItemList search', () => {
  beforeEach(() => {
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

  it('announces that the term is too short to search yet, not a result count', async () => {
    const user = userEvent.setup();
    renderList();

    await user.type(screen.getByTestId('search-input'), 'c');

    await vi.waitFor(() => {
      expect(screen.getByText('Keep typing to search')).toBeInTheDocument();
    });
  });
});

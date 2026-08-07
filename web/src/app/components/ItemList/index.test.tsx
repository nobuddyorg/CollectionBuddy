// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import { ConfirmProvider } from '../Confirm/ConfirmProvider';
import ItemList from './index';
import type { ItemLite } from './types';

// The three data hooks ItemList wires together are exercised on their own
// (useItems.test.tsx, useItemImages/useItemMutations internals are I/O and
// are excluded from coverage). Mocked here so this file can drive exactly
// the render sequence #305 was about -- what the grid paints for a given
// (items, total, loading) triple -- without a real Supabase round trip.
const useItemsMock = vi.fn();
vi.mock('./useItems', () => ({
  useItems: (...args: unknown[]) => useItemsMock(...args),
}));

vi.mock('./useItemImages', () => ({
  useItemImages: () => ({
    images: {},
    loadingItems: new Set(),
    refreshAllImages: vi.fn(),
    uploadImage: vi.fn(),
    deleteImage: vi.fn(),
    deleteAllItemImages: vi.fn(),
    pendingUploads: {},
    deletingPath: new Set(),
  }),
}));

vi.mock('./useItemMutations', () => ({
  useItemMutations: () => ({
    saveEdit: vi.fn(),
    isSaving: false,
    removeItem: vi.fn(),
  }),
}));

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

function renderList() {
  return render(
    <I18nProvider>
      <ToastProvider>
        <ConfirmProvider>
          <ItemList categoryId="cat-1" />
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
      itemsState({ items: [], total: 9, loading: false, page: 1, totalPages: 1 }),
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
    expect(
      screen.getByRole('heading', { name: 'Item 1' }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Item 2' }),
    ).toBeVisible();
  });
});

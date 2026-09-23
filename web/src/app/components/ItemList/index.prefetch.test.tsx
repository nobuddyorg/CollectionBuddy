// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import { ConfirmProvider } from '../Confirm/ConfirmProvider';
import ItemList from './index';
import type { useItems } from './useItems';
import type { useItemImages } from './useItemImages';
import type { useItemMutations } from './useItemMutations';

// A failed prefetch of a lazy chunk must be swallowed, not surfaced as an unhandled rejection.
vi.mock('../Map', () => {
  throw new Error('chunk load failed');
});
vi.mock('../ItemForm', () => {
  throw new Error('chunk load failed');
});

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

describe('ItemList prefetch failures', () => {
  let onUnhandledRejection: Mock<() => void>;

  beforeEach(() => {
    window.localStorage.setItem('lang', 'en');
    useItemsMock.mockReturnValue({
      items: [],
      total: 0,
      loading: false,
      page: 1,
      setPage: vi.fn(),
      totalPages: 1,
      reload: vi.fn(),
      setItems: vi.fn(),
    });
    useItemImagesMock.mockReturnValue({
      images: {},
      loadingItems: new Set(),
      refreshAllImages: vi.fn(),
      showImages: vi.fn(),
      signAllFor: vi.fn(),
      uploadImage: vi.fn(),
      deleteImage: vi.fn(),
      captureItemImagePaths: vi.fn(),
      removeImageBytes: vi.fn(),
      pendingUploads: {},
    });
    useItemMutationsMock.mockReturnValue({
      saveEdit: vi.fn(),
      isSaving: false,
      removeItem: vi.fn(),
    });
    onUnhandledRejection = vi.fn();
    window.addEventListener('unhandledrejection', onUnhandledRejection);
  });

  afterEach(() => {
    window.removeEventListener('unhandledrejection', onUnhandledRejection);
  });

  async function flushMicrotasks() {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  it('swallows a failed prefetch of the map chunk', async () => {
    renderList();
    fireEvent.focus(screen.getByRole('button', { name: 'Open Map' }));
    await flushMicrotasks();

    expect(onUnhandledRejection).not.toHaveBeenCalled();
  });

  it('swallows a failed prefetch of the new-entry form chunk', async () => {
    renderList();
    fireEvent.focus(screen.getByRole('button', { name: 'New entry' }));
    await flushMicrotasks();

    expect(onUnhandledRejection).not.toHaveBeenCalled();
  });
});

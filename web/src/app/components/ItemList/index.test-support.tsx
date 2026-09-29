import { render } from '@testing-library/react';
import { vi, type Mock } from 'vitest';

import { ToastConfirmWrapper } from '../providers.test-support';
import ItemList from './index';
import type { ItemLite } from './types';
import type { useItems } from './useItems';

export { item } from './item.test-support';

export function defaultItemsState() {
  return {
    items: [] as ItemLite[],
    pageImages: null as ReturnType<typeof useItems>['pageImages'],
    total: 0,
    loading: false,
    loadFailed: false,
    page: 1,
    setPage: vi.fn(),
    totalPages: 1,
    reload: vi.fn(),
    setItems: vi.fn(),
  };
}

export function itemsState(
  overrides: Partial<ReturnType<typeof defaultItemsState>> = {},
) {
  return { ...defaultItemsState(), ...overrides };
}

export function defaultImagesState() {
  return {
    images: {} as Record<string, unknown>,
    loadingItems: new Set<string>(),
    refreshAllImages: vi.fn(),
    showImages: vi.fn(),
    signAllFor: vi.fn(),
    uploadImage: vi.fn(),
    deleteImage: vi.fn(),
    captureItemImagePaths: vi.fn(),
    forgetItemImages: vi.fn(),
    pendingUploads: {} as Record<string, number>,
  };
}

export function defaultMutationsState() {
  return {
    saveEdit: vi.fn(),
    isSaving: false,
    removeItem: vi.fn(),
  };
}

// The hook mocks belong to the importing test file, whose `vi.mock('./use…')` blocks route through them.
export function resetHookMocks({
  useItemsMock,
  useItemImagesMock,
  useItemMutationsMock,
}: {
  useItemsMock: Mock;
  useItemImagesMock: Mock;
  useItemMutationsMock: Mock;
}) {
  window.localStorage.setItem('lang', 'en');
  useItemsMock.mockReset();
  useItemImagesMock.mockReset().mockReturnValue(defaultImagesState());
  useItemMutationsMock.mockReset().mockReturnValue(defaultMutationsState());
}

/** The rendered tree, for a test that re-renders it after changing what a hook mock returns. */
export function listTree(props: Partial<Parameters<typeof ItemList>[0]> = {}) {
  return (
    <ToastConfirmWrapper>
      <ItemList categoryId="cat-1" canEdit={true} {...props} />
    </ToastConfirmWrapper>
  );
}

export function renderList(
  props: Partial<Parameters<typeof ItemList>[0]> = {},
) {
  return render(listTree(props));
}

import { act, renderHook } from '@testing-library/react';
import { vi } from 'vitest';

import {
  createCategory,
  listCategories,
  listItemIdsForCategory,
  listItemIdsLinkedElsewhere,
  renameCategory,
} from '../../data/categories';
import {
  listImagePathsForCategory,
  removeImageObjects,
} from '../../data/images';
import { ToastWrapper } from '../providers.test-support';
import { useCategories } from './useCategories';

export {
  ToastWrapper as wrapper,
  commitDeferredDelete,
} from '../providers.test-support';

export const CATEGORY_ONE = { id: 'cat-1', name: 'Cat 1', user_id: 'owner-1' };

export const CATEGORY_TWO = { id: 'cat-2', name: 'Cat 2', user_id: 'owner-1' };

export const IMAGE_ROWS = [
  { id: 'p1', item_id: 'i1', path_full: 'u/i1/a.webp', path_thumb: null },
  {
    id: 'p2',
    item_id: 'i2',
    path_full: 'u/i2/b.webp',
    path_thumb: 'u/i2/b.thumb.webp',
  },
];

export function listCategoriesReturns(categories: (typeof CATEGORY_ONE)[]) {
  vi.mocked(listCategories).mockResolvedValue({
    data: categories,
    error: null,
  } as never);
}

export async function renderLoadedCategories() {
  const hook = renderHook(() => useCategories(), { wrapper: ToastWrapper });
  await act(async () => {
    await hook.result.current.reload();
  });
  return hook;
}

// One category holding two items whose deletion orphans both, with every data call answering.
export function installDeleteMocks() {
  vi.clearAllMocks();
  window.localStorage.setItem('lang', 'en');
  listCategoriesReturns([CATEGORY_ONE]);
  vi.mocked(createCategory).mockResolvedValue({
    data: null,
    error: null,
  } as never);
  vi.mocked(renameCategory).mockResolvedValue({
    data: null,
    error: null,
  } as never);
  vi.mocked(listItemIdsForCategory).mockResolvedValue({
    data: ['i1', 'i2'],
    error: null,
  });
  vi.mocked(listItemIdsLinkedElsewhere).mockResolvedValue({
    data: [],
    error: null,
  });
  vi.mocked(listImagePathsForCategory).mockResolvedValue({
    data: IMAGE_ROWS,
    error: null,
  });
  vi.mocked(removeImageObjects).mockResolvedValue({
    data: [],
    error: null,
  });
}

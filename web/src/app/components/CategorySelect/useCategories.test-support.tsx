import { act, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import {
  createCategory,
  listCategories,
  listItemIdsForCategory,
  listItemIdsLinkedElsewhere,
  renameCategory,
} from '../../data/categories';
import { listImagePathsForItems, removeImageObjects } from '../../data/images';
import { useCategories } from './useCategories';

export function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <ToastProvider>{children}</ToastProvider>
    </I18nProvider>
  );
}

export const CATEGORY_ONE = { id: 'cat-1', name: 'Cat 1', user_id: 'owner-1' };

export const IMAGE_ROWS = [
  { item_id: 'i1', path_full: 'u/i1/a.webp', path_thumb: null },
  { item_id: 'i2', path_full: 'u/i2/b.webp', path_thumb: 'u/i2/b.thumb.webp' },
];

export function listCategoriesReturns(categories: (typeof CATEGORY_ONE)[]) {
  vi.mocked(listCategories).mockResolvedValue({
    data: categories,
    error: null,
  } as never);
}

export async function renderLoadedCategories() {
  const hook = renderHook(() => useCategories(), { wrapper });
  await act(async () => {
    await hook.result.current.reload();
  });
  return hook;
}

// Commits the deferred delete by closing the toast, the same as letting it auto-dismiss would.
export async function commitDeferredDelete() {
  await screen.findByRole('status');
  await userEvent.click(screen.getByRole('button', { name: 'Close' }));
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
  vi.mocked(listImagePathsForItems).mockResolvedValue({
    data: IMAGE_ROWS,
    error: null,
  });
  vi.mocked(removeImageObjects).mockResolvedValue({
    data: [],
    error: null,
  });
}

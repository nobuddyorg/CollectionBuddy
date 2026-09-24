import { renderHook } from '@testing-library/react';
import { vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ConfirmProvider } from '../Confirm/ConfirmProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import { countItemsForCategory } from '../../data/categories';
import type { Category } from '../../types';
import { useCategoryRemoval } from './useCategoryRemoval';
import type { UseCategories } from './useCategories';
import type { UseShares } from './useShares';

export const CATEGORIES: Category[] = [
  { id: 'a', name: 'Coins', user_id: 'owner-1' },
  { id: 'b', name: 'Stamps', user_id: 'owner-1' },
];

export function categories(
  overrides: Partial<UseCategories> = {},
): UseCategories {
  return {
    categories: CATEGORIES,
    isLoading: false,
    isCreating: false,
    isDeleting: false,
    isRenaming: false,
    reload: vi.fn().mockResolvedValue(CATEGORIES),
    createCategory: vi.fn(),
    renameCategory: vi.fn(),
    deleteCategory: vi.fn(),
    // Hands back a restore function, as the real one does.
    optimisticRemove: vi.fn(() => vi.fn()),
    ...overrides,
  };
}

export function shares(overrides: Partial<UseShares> = {}): UseShares {
  return {
    shares: [],
    isLoading: false,
    isSharing: false,
    isRevoking: false,
    isUpdatingRole: false,
    reload: vi.fn().mockResolvedValue([]),
    createShare: vi.fn(),
    deleteShare: vi.fn(),
    updateShareRole: vi.fn(),
    ...overrides,
  };
}

export function setUp({
  selectedCategoryId = 'a' as string | null,
  selected = CATEGORIES[0] as Category | null,
  categoriesState = categories(),
  sharesState = shares(),
}) {
  const onSelect = vi.fn();
  // The confirm dialog renders through the provider, so the hook needs a real tree around it.
  const { result, rerender } = renderHook(
    (props: {
      selectedCategoryId: string | null;
      selected: Category | null;
      categoriesState: UseCategories;
      sharesState: UseShares;
    }) =>
      useCategoryRemoval({
        selectedCategoryId: props.selectedCategoryId,
        selected: props.selected,
        sortedCategories: CATEGORIES,
        categories: props.categoriesState,
        shares: props.sharesState,
        onSelect,
      }),
    {
      initialProps: {
        selectedCategoryId,
        selected,
        categoriesState,
        sharesState,
      },
      wrapper: ({ children }) => (
        <I18nProvider>
          <ToastProvider>
            <ConfirmProvider>{children}</ConfirmProvider>
          </ToastProvider>
        </I18nProvider>
      ),
    },
  );
  return { result, onSelect, rerender };
}

export function installEmptyCountMock() {
  vi.clearAllMocks();
  window.localStorage.setItem('lang', 'en');
  vi.mocked(countItemsForCategory).mockResolvedValue({
    count: 0,
    error: null,
  } as never);
}

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { ToastConfirmWrapper } from '../providers.test-support';
import CategorySelect from './index';
import { sharesState } from './shares.test-support';
import type { UseCategories } from './useCategories';
import { useExportCategory } from './useExportCategory';
import { useImportCategory } from './useImportCategory';
import { useShares } from './useShares';

export function exportState(
  overrides: Partial<ReturnType<typeof useExportCategory>> = {},
) {
  return {
    isExporting: false,
    message: null,
    runExport: vi.fn(),
    cancelExport: vi.fn(),
    ...overrides,
  };
}

export function importState(
  overrides: Partial<ReturnType<typeof useImportCategory>> = {},
) {
  return {
    isImporting: false,
    message: null,
    runImport: vi.fn(),
    cancelImport: vi.fn(),
    ...overrides,
  };
}

// user_id 'owner-1' matches renderSelect's default userId, so both read as owned by the viewer.
export const CATEGORIES = [
  { id: 'a', name: 'Coins', user_id: 'owner-1' },
  { id: 'b', name: 'Stamps', user_id: 'owner-1' },
];

export function categories(
  overrides: Partial<UseCategories> = {},
): UseCategories {
  return {
    categories: CATEGORIES,
    isLoading: false,
    loadFailed: false,
    isCreating: false,
    isDeleting: false,
    isRenaming: false,
    reload: vi.fn().mockResolvedValue(CATEGORIES),
    createCategory: vi.fn(),
    renameCategory: vi.fn(),
    deleteCategory: vi.fn(),
    optimisticRemove: vi.fn(() => vi.fn()),
    ...overrides,
  };
}

export function selectTree(
  props: Partial<Parameters<typeof CategorySelect>[0]> = {},
) {
  return (
    <ToastConfirmWrapper>
      <CategorySelect
        selectedCategoryId="a"
        onSelect={vi.fn()}
        categories={categories()}
        userId="owner-1"
        {...props}
      />
    </ToastConfirmWrapper>
  );
}

export function renderSelect(
  props: Partial<Parameters<typeof CategorySelect>[0]> = {},
) {
  const onSelect = vi.fn();
  const view = render(selectTree({ onSelect, ...props }));
  return { onSelect, view };
}

export async function openPanel() {
  await userEvent.click(
    screen.getByRole('button', { name: 'Open collection' }),
  );
}

// Idle export, import and sharing hooks, for the files that mock all three.
export function installHookStates() {
  window.localStorage.setItem('lang', 'en');
  vi.mocked(useExportCategory).mockReturnValue(exportState());
  vi.mocked(useImportCategory).mockReturnValue(importState());
  vi.mocked(useShares).mockReturnValue(sharesState());
}

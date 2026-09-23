// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ConfirmProvider } from '../Confirm/ConfirmProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import CategorySelect from './index';
import type { UseCategories } from './useCategories';
import { useExportCategory } from './useExportCategory';
import { useImportCategory } from './useImportCategory';
import { useShares } from './useShares';

vi.mock('../../data/categories', () => ({
  countItemsForCategory: vi.fn(),
}));

// The real hook drives an actual exportCategory() call; only its state matters here.
vi.mock('./useExportCategory', () => ({
  useExportCategory: vi.fn(),
}));

// The real hook reads a ZIP and drives an actual importCategory() call.
vi.mock('./useImportCategory', () => ({
  useImportCategory: vi.fn(),
}));

// The real hook round-trips through Supabase; useShares.test.tsx covers its CRUD.
vi.mock('./useShares', () => ({
  useShares: vi.fn(),
}));

function exportState(
  overrides: Partial<ReturnType<typeof useExportCategory>> = {},
) {
  return {
    progress: null,
    isExporting: false,
    message: null,
    runExport: vi.fn(),
    cancelExport: vi.fn(),
    ...overrides,
  };
}

function importState(
  overrides: Partial<ReturnType<typeof useImportCategory>> = {},
) {
  return {
    progress: null,
    isImporting: false,
    message: null,
    runImport: vi.fn(),
    cancelImport: vi.fn(),
    ...overrides,
  };
}

function sharesState(overrides: Partial<ReturnType<typeof useShares>> = {}) {
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

// user_id 'owner-1' matches renderSelect's default userId, so both read as owned by the viewer.
const CATEGORIES = [
  { id: 'a', name: 'Coins', user_id: 'owner-1' },
  { id: 'b', name: 'Stamps', user_id: 'owner-1' },
];

function categories(overrides: Partial<UseCategories> = {}): UseCategories {
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
    optimisticRemove: vi.fn(() => vi.fn()),
    ...overrides,
  };
}

function renderSelect(
  props: Partial<Parameters<typeof CategorySelect>[0]> = {},
) {
  const onSelect = vi.fn();
  render(
    <I18nProvider>
      <ToastProvider>
        <ConfirmProvider>
          <CategorySelect
            selectedCategoryId="a"
            onSelect={onSelect}
            categories={categories()}
            userId="owner-1"
            {...props}
          />
        </ConfirmProvider>
      </ToastProvider>
    </I18nProvider>,
  );
  return { onSelect };
}

describe('CategorySelect export', () => {
  beforeEach(() => {
    window.localStorage.setItem('lang', 'en');
    vi.mocked(useExportCategory).mockReturnValue(exportState());
    vi.mocked(useImportCategory).mockReturnValue(importState());
    vi.mocked(useShares).mockReturnValue(sharesState());
  });

  it('offers the export under a rule of its own, away from delete', async () => {
    renderSelect();
    await userEvent.click(
      screen.getByRole('button', { name: 'Open collection' }),
    );

    const exportButton = screen.getByRole('button', { name: 'Export' });
    expect(exportButton).toBeVisible();
    expect(exportButton).toBeEnabled();
    // A slip between Export and Delete would be destructive.
    expect(exportButton.parentElement).not.toBe(
      screen.getByRole('button', { name: 'Delete' }).parentElement,
    );
    expect(exportButton.parentElement?.className).toContain('border-t');
  });

  it('says what the export contains while it is not running', async () => {
    renderSelect();
    await userEvent.click(
      screen.getByRole('button', { name: 'Open collection' }),
    );
    // One line: the progress messages replacing it are, and a wrapped hint would shrink the row.
    expect(screen.getByText('Photos, JSON and CSV.')).toBeVisible();
  });

  describe('while an export is running', () => {
    it('disables delete and rename, not just the export button itself', async () => {
      vi.mocked(useExportCategory).mockReturnValue(
        exportState({ isExporting: true, message: 'Photographs 3 of 9…' }),
      );
      renderSelect();
      await userEvent.click(
        screen.getByRole('button', { name: 'Open collection' }),
      );

      expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Save name' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
    });

    it('offers a Cancel affordance next to the progress line, absent while nothing is running', async () => {
      const cancelExport = vi.fn();
      vi.mocked(useExportCategory).mockReturnValue(
        exportState({
          isExporting: true,
          message: 'Photographs 3 of 9…',
          cancelExport,
        }),
      );
      renderSelect();
      await userEvent.click(
        screen.getByRole('button', { name: 'Open collection' }),
      );

      const cancel = screen.getByRole('button', { name: 'Cancel export' });
      await userEvent.click(cancel);
      expect(cancelExport).toHaveBeenCalledTimes(1);
    });

    it('does not offer Cancel while no export is running', async () => {
      renderSelect();
      await userEvent.click(
        screen.getByRole('button', { name: 'Open collection' }),
      );
      expect(
        screen.queryByRole('button', { name: 'Cancel export' }),
      ).not.toBeInTheDocument();
    });
  });

  it('offers no export when no category is selected', async () => {
    renderSelect({ selectedCategoryId: null });
    expect(
      screen.queryByRole('button', { name: 'Export' }),
    ).not.toBeInTheDocument();
  });
});

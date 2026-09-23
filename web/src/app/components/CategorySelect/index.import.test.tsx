// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
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

describe('CategorySelect import', () => {
  beforeEach(() => {
    window.localStorage.setItem('lang', 'en');
    vi.mocked(useExportCategory).mockReturnValue(exportState());
    vi.mocked(useImportCategory).mockReturnValue(importState());
    vi.mocked(useShares).mockReturnValue(sharesState());
  });

  it('offers import independently of a category being selected', async () => {
    // The panel starts expanded when nothing is selected, so there is no toggle to click.
    renderSelect({ selectedCategoryId: null });

    const importButton = screen.getByRole('button', { name: 'Import' });
    expect(importButton).toBeVisible();
    expect(importButton).toBeEnabled();
  });

  it('says what a file needs to be while nothing is running', async () => {
    renderSelect();
    await userEvent.click(
      screen.getByRole('button', { name: 'Open collection' }),
    );
    expect(
      screen.getByText('A .zip archive exported from CollectionBuddy.'),
    ).toBeVisible();
  });

  it('opens the file picker when Import is clicked, not on page load', async () => {
    renderSelect();
    await userEvent.click(
      screen.getByRole('button', { name: 'Open collection' }),
    );
    const input = screen.getByTestId('import-file-input');
    const click = vi.spyOn(input, 'click');

    await userEvent.click(screen.getByRole('button', { name: 'Import' }));

    expect(click).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the file picker is cancelled with no file chosen', async () => {
    const runImport = vi.fn();
    vi.mocked(useImportCategory).mockReturnValue(importState({ runImport }));
    renderSelect();
    await userEvent.click(
      screen.getByRole('button', { name: 'Open collection' }),
    );

    const input = screen.getByTestId('import-file-input');
    fireEvent.change(input, { target: { files: [] } });

    expect(runImport).not.toHaveBeenCalled();
  });

  it('runs the import with the picked file, and switches to the new category', async () => {
    const runImport = vi.fn(
      async (_file: File, onImported?: (id: string) => void) => {
        onImported?.('new-cat-id');
      },
    );
    vi.mocked(useImportCategory).mockReturnValue(importState({ runImport }));
    const { onSelect } = renderSelect();
    await userEvent.click(
      screen.getByRole('button', { name: 'Open collection' }),
    );

    const file = new File(['zip bytes'], 'coins.zip', {
      type: 'application/zip',
    });
    const input = screen.getByTestId('import-file-input');
    await userEvent.upload(input, file);

    expect(runImport).toHaveBeenCalledWith(file, expect.any(Function));
    expect(onSelect).toHaveBeenCalledWith('new-cat-id');
  });

  // reload() must resolve before onSelect, or the imported category is not yet there to select.
  it('reloads the category list before selecting the imported category', async () => {
    const calls: string[] = [];
    const reload = vi.fn(async () => {
      calls.push('reload');
      return CATEGORIES;
    });
    const runImport = vi.fn(
      async (_file: File, onImported?: (id: string) => void) => {
        onImported?.('new-cat-id');
      },
    );
    vi.mocked(useImportCategory).mockReturnValue(importState({ runImport }));
    const { onSelect } = renderSelect({ categories: categories({ reload }) });
    vi.mocked(onSelect).mockImplementation(() => calls.push('select'));
    await userEvent.click(
      screen.getByRole('button', { name: 'Open collection' }),
    );

    const file = new File(['zip bytes'], 'coins.zip', {
      type: 'application/zip',
    });
    const input = screen.getByTestId('import-file-input');
    await userEvent.upload(input, file);

    expect(reload).toHaveBeenCalled();
    expect(calls).toEqual(['reload', 'select']);
  });

  describe('while an import is running', () => {
    it('disables the import button and shows its progress message', async () => {
      vi.mocked(useImportCategory).mockReturnValue(
        importState({ isImporting: true, message: 'Photographs 3 of 9…' }),
      );
      renderSelect();
      await userEvent.click(
        screen.getByRole('button', { name: 'Open collection' }),
      );

      expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();
      expect(screen.getByText('Photographs 3 of 9…')).toBeVisible();
    });

    it('offers a Cancel affordance, absent while nothing is running', async () => {
      const cancelImport = vi.fn();
      vi.mocked(useImportCategory).mockReturnValue(
        importState({
          isImporting: true,
          message: 'Photographs 3 of 9…',
          cancelImport,
        }),
      );
      renderSelect();
      await userEvent.click(
        screen.getByRole('button', { name: 'Open collection' }),
      );

      const cancel = screen.getByRole('button', { name: 'Cancel import' });
      expect(cancel).toBeVisible();
      await userEvent.click(cancel);
      expect(cancelImport).toHaveBeenCalledOnce();
    });
  });
});

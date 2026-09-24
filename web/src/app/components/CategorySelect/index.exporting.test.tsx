// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useExportCategory } from './useExportCategory';
import {
  exportState,
  installHookStates,
  openPanel,
  renderSelect,
} from './index.test-support';

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

describe('CategorySelect export', () => {
  beforeEach(installHookStates);

  it('offers the export under a rule of its own, away from delete', async () => {
    renderSelect();
    await openPanel();

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
    await openPanel();
    // One line: the progress messages replacing it are, and a wrapped hint would shrink the row.
    expect(screen.getByText('Photos, JSON and CSV.')).toBeVisible();
  });

  describe('while an export is running', () => {
    it('disables delete and rename, not just the export button itself', async () => {
      vi.mocked(useExportCategory).mockReturnValue(
        exportState({ isExporting: true, message: 'Photographs 3 of 9…' }),
      );
      renderSelect();
      await openPanel();

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
      await openPanel();

      const cancel = screen.getByRole('button', { name: 'Cancel export' });
      await userEvent.click(cancel);
      expect(cancelExport).toHaveBeenCalledTimes(1);
    });

    it('does not offer Cancel while no export is running', async () => {
      renderSelect();
      await openPanel();
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

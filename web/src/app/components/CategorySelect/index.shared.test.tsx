// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
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
import type { UseShares } from './useShares';

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

describe('CategorySelect with a shared category', () => {
  beforeEach(() => {
    window.localStorage.setItem('lang', 'en');
    vi.mocked(useExportCategory).mockReturnValue(exportState());
    vi.mocked(useImportCategory).mockReturnValue(importState());
    vi.mocked(useShares).mockReturnValue(sharesState());
  });

  // user_id is what makes "a" someone else's category here, shared with the default viewer.
  const sharedCategories = [
    { id: 'a', name: 'Coins', user_id: 'other-owner' },
    { id: 'b', name: 'Stamps', user_id: 'owner-1' },
  ];

  it('marks the shared tab, but not one the viewer owns', async () => {
    renderSelect({ categories: categories({ categories: sharedCategories }) });
    await userEvent.click(
      screen.getByRole('button', { name: 'Open collection' }),
    );

    const sharedTab = screen.getByRole('tab', { name: /Coins/ });
    expect(
      within(sharedTab).getByRole('img', { name: 'Shared with you' }),
    ).toBeInTheDocument();

    const ownedTab = screen.getByRole('tab', { name: 'Stamps' });
    expect(
      within(ownedTab).queryByRole('img', { name: 'Shared with you' }),
    ).not.toBeInTheDocument();
  });

  it('shows the name disabled rather than offering to rename it', async () => {
    renderSelect({ categories: categories({ categories: sharedCategories }) });
    await userEvent.click(
      screen.getByRole('button', { name: 'Open collection' }),
    );

    const rename = screen.getByLabelText('Rename');
    expect(rename).toHaveValue('Coins');
    expect(rename).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save name' })).toBeDisabled();
  });

  it('does not offer sharing controls for a category the viewer does not own', async () => {
    renderSelect({ categories: categories({ categories: sharedCategories }) });
    await userEvent.click(
      screen.getByRole('button', { name: 'Open collection' }),
    );
    expect(
      screen.queryByLabelText('Share with (email)'),
    ).not.toBeInTheDocument();
  });

  // exportCategory() builds storage paths from the caller's uid, which is wrong for a grantee.
  it('disables export rather than offering a broken one', async () => {
    renderSelect({ categories: categories({ categories: sharedCategories }) });
    await userEvent.click(
      screen.getByRole('button', { name: 'Open collection' }),
    );
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
  });

  // Delete stays in the same slot but ends only the viewer's own access, via deleteShare.
  it('leaves instead of deleting, with different confirm copy, and falls through to what is left', async () => {
    const deleteShare = vi.fn<UseShares['deleteShare']>();
    const deleteCategory = vi.fn<UseCategories['deleteCategory']>();
    vi.mocked(useShares).mockReturnValue(
      sharesState({
        shares: [
          {
            id: 'share-1',
            invited_email: 'me@example.com',
            expires_at: null,
            owner_user_id: 'other-owner',
            role: 'viewer',
          },
        ],
        deleteShare,
      }),
    );
    const { onSelect } = renderSelect({
      categories: categories({ categories: sharedCategories, deleteCategory }),
    });
    await userEvent.click(
      screen.getByRole('button', { name: 'Open collection' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(
      await screen.findByText(
        'Leave "Coins"? You\'ll stop seeing it. The owner\'s copy is unaffected.',
      ),
    ).toBeVisible();

    await userEvent.click(screen.getByTestId('confirm-accept'));

    expect(deleteShare).toHaveBeenCalledWith(
      'share-1',
      expect.objectContaining({
        successMessage: 'Left shared collection.',
        errorMessage: 'Could not leave this collection. Please try again.',
      }),
    );
    expect(deleteCategory).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith('b');
  });
});

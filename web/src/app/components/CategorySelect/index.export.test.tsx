// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ConfirmProvider } from '../Confirm/ConfirmProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import CategorySelect from './index';
import type { UseCategories } from './useCategories';

// Mocked to keep the panel's expand-on-open from firing a real, unmocked
// Supabase call, the same way index.test.tsx does.
vi.mock('./useShares', () => ({
  useShares: vi.fn().mockReturnValue({
    shares: [],
    isLoading: false,
    isSharing: false,
    isRevoking: false,
    reload: vi.fn().mockResolvedValue([]),
    createShare: vi.fn(),
    deleteShare: vi.fn(),
  }),
}));

// index.test.tsx mocks useExportCategory away entirely, so the catch ->
// toast.error -> reset path was never exercised. This is the one test that
// runs the real hook: with no signed-in session, exportCategory rejects
// before any Supabase/storage call, which is enough to cover that path
// with zero new mocks.

function categories(overrides: Partial<UseCategories> = {}): UseCategories {
  return {
    cats: [{ id: 'a', name: 'Coins', user_id: 'owner-1' }],
    isLoading: false,
    isCreating: false,
    isDeleting: false,
    isRenaming: false,
    reload: () => {},
    createCategory: async () => null,
    renameCategory: async () => {},
    deleteCategory: async () => true,
    ...overrides,
  } as UseCategories;
}

function renderSelect() {
  render(
    <I18nProvider>
      <ToastProvider>
        <ConfirmProvider>
          <CategorySelect
            selectedCat="a"
            onSelect={() => {}}
            categories={categories()}
            userId="owner-1"
          />
        </ConfirmProvider>
      </ToastProvider>
    </I18nProvider>,
  );
}

describe('exporting with no session', () => {
  beforeEach(() => {
    // Cleared, not assumed empty: `getSession()` resolves with no session
    // (and the export fails) only if nothing is persisted under it.
    window.localStorage.clear();
    window.localStorage.setItem('lang', 'en');
  });

  it('reports the failure and re-enables the button, without hanging as "exporting" forever', async () => {
    renderSelect();
    await userEvent.click(
      screen.getByRole('button', { name: 'Open collection' }),
    );

    const exportButton = screen.getByRole('button', { name: 'Export' });
    expect(exportButton).toBeEnabled();
    await userEvent.click(exportButton);

    expect(
      await screen.findByText(
        'Could not export this collection. Please try again.',
      ),
    ).toBeVisible();
    expect(exportButton).toBeEnabled();
    expect(exportButton).toHaveAttribute('aria-busy', 'false');
  });
});
